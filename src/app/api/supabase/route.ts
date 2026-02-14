import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Generic Supabase proxy route that uses the service role key
 * to bypass RLS. Accepts a JSON body describing the operation.
 */

type Operation =
  | { action: 'select'; table: string; filters?: Record<string, string>; order?: { column: string; ascending: boolean } }
  | { action: 'select_in'; table: string; column: string; values: string[] }
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
        let query = supabase.from(op.table).select('*');
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
        // SELECT * FROM table WHERE column IN (values) — batched
        const allResults: Record<string, unknown>[] = [];
        const batchSize = 500;
        for (let i = 0; i < op.values.length; i += batchSize) {
          const batch = op.values.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from(op.table)
            .select('*')
            .in(op.column, batch);
          if (error) return NextResponse.json({ error: error.message }, { status: 400 });
          if (data) allResults.push(...data);
        }
        return NextResponse.json({ data: allResults });
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
