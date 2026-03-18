-- Migration 007: Enable Row Level Security on all public tables
--
-- WHY: Supabase grants the "anon" and "authenticated" PostgREST roles
-- broad default privileges on public tables. Even though this app does NOT
-- query tables via the anon key, enabling RLS with no policies creates a
-- deny-all default that prevents any accidental or malicious access via
-- the REST API.
--
-- WHO IS NOT AFFECTED:
--   - Better Auth: connects via DATABASE_URL (direct pg), bypasses RLS
--   - App queries: use service role key (getSupabaseAdmin), bypasses RLS
--   - Supabase Dashboard: uses service role, bypasses RLS

-- ============================================================
-- 1. Enable RLS on app tables (created by migrations 001-006)
-- ============================================================
ALTER TABLE supply_chain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;

-- rate_limits: only if migration 006 has been applied
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rate_limits') THEN
    ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ============================================================
-- 2. Enable RLS on Better Auth tables
--    Auto-created by Better Auth via direct pg connection.
--    "user" requires quoting (SQL reserved word).
-- ============================================================
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE account ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Revoke default privileges from PostgREST roles
--    Belt-and-suspenders: even if someone disables RLS later,
--    these roles still cannot access the tables.
-- ============================================================
REVOKE ALL ON supply_chain_events FROM anon, authenticated;
REVOKE ALL ON sessions FROM anon, authenticated;
REVOKE ALL ON messages FROM anon, authenticated;
REVOKE ALL ON audit_log FROM anon, authenticated;
REVOKE ALL ON dashboards FROM anon, authenticated;
REVOKE ALL ON datasets FROM anon, authenticated;
REVOKE ALL ON "user" FROM anon, authenticated;
REVOKE ALL ON "session" FROM anon, authenticated;
REVOKE ALL ON account FROM anon, authenticated;
REVOKE ALL ON verification FROM anon, authenticated;

-- rate_limits table and functions: only if migration 006 has been applied
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rate_limits') THEN
    REVOKE ALL ON rate_limits FROM anon, authenticated;
    REVOKE EXECUTE ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) FROM anon, authenticated;
    REVOKE EXECUTE ON FUNCTION cleanup_rate_limits() FROM anon, authenticated;
  END IF;
END $$;

-- ============================================================
-- 4. NO POLICIES ARE CREATED
--    With RLS enabled and no policies, all SELECT/INSERT/UPDATE/DELETE
--    through anon or authenticated roles return zero rows.
--    All legitimate access goes through the service role key
--    or direct PostgreSQL connection.
-- ============================================================
