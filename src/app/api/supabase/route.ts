import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Generic Supabase proxy route that uses the service role key
 * to bypass RLS. Accepts a JSON body describing the operation.
 */

type Operation =
  | { action: 'select'; table: string; filters?: Record<string, string>; order?: { column: string; ascending: boolean } }
  | { action: 'select_in'; table: string; column: string; values: string[] }
  | { action: 'get_workspace_cells'; workspaceId: string }
  | { action: 'insert'; table: string; data: Record<string, unknown> | Record<string, unknown>[]; returnData?: boolean }
  | { action: 'update'; table: string; data: Record<string, unknown>; match: Record<string, string> }
  | { action: 'upsert'; table: string; data: Record<string, unknown>; onConflict: string }
  | { action: 'delete'; table: string; match: Record<string, string> };

export async function POST(req: NextRequest) {
  try {
    const op: Operation = await req.json();
    const supabase = createServiceClient();

    switch (op.action) {
      case 'select': {
        let query = supabase.from(op.table).select('*').limit(10000);
        if (op.filters) {
          for (const [key, value] of Object.entries(op.filters)) {
            query = query.eq(key, value);
          }
        }
        if (op.order) {
          query = query.order(op.order.column, { ascending: op.order.ascending });
        }
        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ data });
      }

      case 'select_in': {
        // SELECT * FROM table WHERE column IN (values) — batched in small chunks
        const allResults: Record<string, unknown>[] = [];
        const batchSize = 50;
        for (let i = 0; i < op.values.length; i += batchSize) {
          const batch = op.values.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from(op.table)
            .select('*')
            .in(op.column, batch)
            .limit(10000);
          if (error) return NextResponse.json({ error: error.message }, { status: 400 });
          if (data) allResults.push(...data);
        }
        return NextResponse.json({ data: allResults });
      }

      case 'get_workspace_cells': {
        // Efficient: get all cell_values for a workspace via inner join on rows
        // cell_values belongs to rows, rows belongs to workspace
        // Use Supabase's foreign key filtering: cell_values -> rows -> workspace_id
        const { data: rows, error: rowErr } = await supabase
          .from('rows')
          .select('id')
          .eq('workspace_id', op.workspaceId)
          .limit(10000);
        if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 400 });
        if (!rows || rows.length === 0) return NextResponse.json({ data: [] });

        // Fetch cell values in batches of 50 row IDs
        const allCells: Record<string, unknown>[] = [];
        const cellBatch = 50;
        for (let i = 0; i < rows.length; i += cellBatch) {
          const batch = rows.slice(i, i + cellBatch).map((r) => r.id);
          const { data: cells, error: cellErr } = await supabase
            .from('cell_values')
            .select('*')
            .in('row_id', batch)
            .limit(10000);
          if (cellErr) return NextResponse.json({ error: cellErr.message }, { status: 400 });
          if (cells) allCells.push(...cells);
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

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    console.error('Supabase proxy error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
