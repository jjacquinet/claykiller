import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/** Server-side Supabase client using the service role key (bypasses RLS). */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
