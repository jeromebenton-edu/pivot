import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use globalThis to survive HMR in dev mode (#R9-4)
const globalSupa = globalThis as unknown as {
  __pivotSupabase?: SupabaseClient | null;
  __pivotSupabaseAdmin?: SupabaseClient | null;
};
if (globalSupa.__pivotSupabase === undefined) globalSupa.__pivotSupabase = null;
if (globalSupa.__pivotSupabaseAdmin === undefined) globalSupa.__pivotSupabaseAdmin = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Browser client (uses anon key, respects RLS)
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!globalSupa.__pivotSupabase) {
    globalSupa.__pivotSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return globalSupa.__pivotSupabase;
}

// Server client (uses service role key, bypasses RLS)
// NOTE: This intentionally uses the service role key because all API routes
// enforce ownership checks (user_id filtering) at the application layer.
// RLS is a defense-in-depth measure for Supabase Dashboard access only. (#R8)
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!globalSupa.__pivotSupabaseAdmin) {
    globalSupa.__pivotSupabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return globalSupa.__pivotSupabaseAdmin;
}
