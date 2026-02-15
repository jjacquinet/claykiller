import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generic Supabase proxy route that uses the service role key
 * to bypass RLS. Accepts a JSON body describing the operation.
 */

/** Paginated select that fetches ALL rows, bypassing Supabase's 1000-row default cap. */
async function paginatedSelect(
  supabase: SupabaseClient,
  table: string,
  options?: {
    filters?: Record<string, string>;
    order?: { column: string; ascending: boolean };
    selectColumns?: string;
    inFilter?: { column: string; values: string[] };
  },
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const PAGE_SIZE = 1000;
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(options?.selectColumns ?? '*')
      .range(from, from + PAGE_SIZE - 1);

    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        query = query.eq(key, value);
      }
    }
    if (options?.inFilter) {
      query = query.in(options.inFilter.column, options.inFilter.values);
    }
    if (options?.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending });
    }

    const { data, error } = await query;
    if (error) return { data: allRows, error: error.message };
    if (!data || data.length === 0) break;

    allRows.push(...(data as unknown as Record<string, unknown>[]));

    // If we got fewer rows than PAGE_SIZE, we've reached the end
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: allRows, error: null };
}

type Operation =
  | { action: 'select'; table: string; filters?: Record<string, string>; order?: { column: string; ascending: boolean } }
  | { action: 'select_in'; table: string; column: string; values: string[] }
  | { action: 'get_workspace_cells'; workspaceId: string }
  | { action: 'insert'; table: string; data: Record<string, unknown> | Record<string, unknown>[]; returnData?: boolean }
  | { action: 'update'; table: string; data: Record<string, unknown>; match: Record<string, string> }
  | { action: 'upsert'; table: string; data: Record<string, unknown>; onConflict: string }
  | { action: 'delete'; table: string; match: Record<string, string> }
  | { action: 'delete_in'; table: string; column: string; values: string[] }
  | { action: 'delete_column'; columnId: string }
  | { action: 'delete_rows'; rowIds: string[] };

export async function POST(req: NextRequest) {
  try {
    const op: Operation = await req.json();
    const supabase = createServiceClient();

    switch (op.action) {
      case 'select': {
        const { data, error } = await paginatedSelect(supabase, op.table, {
          filters: op.filters,
          order: op.order,
        });
        if (error) return NextResponse.json({ error }, { status: 400 });
        return NextResponse.json({ data });
      }

      case 'select_in': {
        // SELECT * FROM table WHERE column IN (values) — batched in small chunks
        const allResults: Record<string, unknown>[] = [];
        const batchSize = 50;
        for (let i = 0; i < op.values.length; i += batchSize) {
          const batch = op.values.slice(i, i + batchSize);
          const { data, error } = await paginatedSelect(supabase, op.table, {
            inFilter: { column: op.column, values: batch },
          });
          if (error) return NextResponse.json({ error }, { status: 400 });
          allResults.push(...data);
        }
        return NextResponse.json({ data: allResults });
      }

      case 'get_workspace_cells': {
        // 1. Fetch ALL row IDs for this workspace (paginated)
        const { data: rows, error: rowErr } = await paginatedSelect(supabase, 'rows', {
          filters: { workspace_id: op.workspaceId },
          selectColumns: 'id',
        });
        if (rowErr) return NextResponse.json({ error: rowErr }, { status: 400 });
        if (!rows || rows.length === 0) return NextResponse.json({ data: [] });

        // 2. Fetch cell values in batches of 50 row IDs (each batch paginated)
        const allCells: Record<string, unknown>[] = [];
        const cellBatch = 50;
        for (let i = 0; i < rows.length; i += cellBatch) {
          const batchIds = rows.slice(i, i + cellBatch).map((r) => r.id as string);
          const { data: cells, error: cellErr } = await paginatedSelect(supabase, 'cell_values', {
            inFilter: { column: 'row_id', values: batchIds },
          });
          if (cellErr) return NextResponse.json({ error: cellErr }, { status: 400 });
          allCells.push(...cells);
        }
        return NextResponse.json({ data: allCells });
      }

      case 'insert': {
        const q = supabase.from(op.table).insert(op.data).select();
        const { data, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ data });
      }

      case 'update': {
        let query = supabase.from(op.table).update(op.data);
        for (const [key, value] of Object.entries(op.match)) {
          query = query.eq(key, value);
        }
        const { data, error } = await query.select();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ data });
      }

      case 'upsert': {
        const { data, error } = await supabase
          .from(op.table)
          .upsert(op.data, { onConflict: op.onConflict })
          .select();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ data });
      }

      case 'delete': {
        let query = supabase.from(op.table).delete();
        for (const [key, value] of Object.entries(op.match)) {
          query = query.eq(key, value);
        }
        const { data, error } = await query.select();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ data });
      }

      case 'delete_in': {
        // DELETE FROM table WHERE column IN (values) — batched
        const batchDel = 50;
        for (let i = 0; i < op.values.length; i += batchDel) {
          const batch = op.values.slice(i, i + batchDel);
          const { error } = await supabase
            .from(op.table)
            .delete()
            .in(op.column, batch);
          if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ data: { deleted: op.values.length } });
      }

      case 'delete_column': {
        // Delete all cell_values for this column, then delete the column definition
        const { error: cellErr } = await supabase
          .from('cell_values')
          .delete()
          .eq('column_id', op.columnId);
        if (cellErr) return NextResponse.json({ error: cellErr.message }, { status: 400 });

        const { error: colErr } = await supabase
          .from('column_definitions')
          .delete()
          .eq('id', op.columnId);
        if (colErr) return NextResponse.json({ error: colErr.message }, { status: 400 });

        return NextResponse.json({ data: { deleted: true } });
      }

      case 'delete_rows': {
        // Delete all cell_values for these rows, then delete the rows
        const rowBatch = 50;
        for (let i = 0; i < op.rowIds.length; i += rowBatch) {
          const batch = op.rowIds.slice(i, i + rowBatch);
          await supabase.from('cell_values').delete().in('row_id', batch);
        }
        for (let i = 0; i < op.rowIds.length; i += rowBatch) {
          const batch = op.rowIds.slice(i, i + rowBatch);
          const { error } = await supabase.from('rows').delete().in('id', batch);
          if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ data: { deleted: op.rowIds.length } });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    console.error('Supabase proxy error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
