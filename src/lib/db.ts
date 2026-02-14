/**
 * Client-side helper to call our Supabase proxy API route.
 * All mutations go through the server which uses the service role key
 * to bypass RLS.
 */

async function call<T = Record<string, unknown>[]>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/supabase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error || 'API request failed');
  }
  return json.data as T;
}

export const db = {
  /** SELECT * FROM table WHERE filters ORDER BY order */
  select<T = Record<string, unknown>>(
    table: string,
    filters?: Record<string, string>,
    order?: { column: string; ascending: boolean },
  ): Promise<T[]> {
    return call<T[]>({ action: 'select', table, filters, order });
  },

  /** SELECT * FROM table WHERE column IN (values) */
  selectIn<T = Record<string, unknown>>(
    table: string,
    column: string,
    values: string[],
  ): Promise<T[]> {
    if (values.length === 0) return Promise.resolve([]);
    return call<T[]>({ action: 'select_in', table, column, values });
  },

  /** INSERT INTO table VALUES (data) RETURNING * */
  insert<T = Record<string, unknown>>(
    table: string,
    data: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<T[]> {
    return call<T[]>({ action: 'insert', table, data });
  },

  /** INSERT single row, return the single object */
  async insertOne<T = Record<string, unknown>>(
    table: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    const rows = await call<T[]>({ action: 'insert', table, data });
    return rows[0];
  },

  /** UPDATE table SET data WHERE match */
  update<T = Record<string, unknown>>(
    table: string,
    data: Record<string, unknown>,
    match: Record<string, string>,
  ): Promise<T[]> {
    return call<T[]>({ action: 'update', table, data, match });
  },

  /** UPSERT (insert or update on conflict) */
  upsert<T = Record<string, unknown>>(
    table: string,
    data: Record<string, unknown>,
    onConflict: string,
  ): Promise<T[]> {
    return call<T[]>({ action: 'upsert', table, data, onConflict });
  },

  /** DELETE FROM table WHERE match */
  remove<T = Record<string, unknown>>(
    table: string,
    match: Record<string, string>,
  ): Promise<T[]> {
    return call<T[]>({ action: 'delete', table, match });
  },
};
