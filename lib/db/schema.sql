-- Pivot Enterprise Schema (Reference)
-- Actual tables are created by migrations/ and Better Auth.
-- This file serves as documentation of the intended schema.

-- Chat sessions
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  chart_config jsonb,
  sources jsonb,
  created_at timestamptz default now()
);

-- Audit log
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  details jsonb,
  ip_address text,
  created_at timestamptz default now()
);

-- Datasets (for Phase 3)
create table if not exists datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  type text not null check (type in ('builtin','csv','excel','database')),
  row_count integer,
  columns jsonb,
  created_at timestamptz default now()
);

-- Row Level Security
-- ==================
-- RLS is enabled on ALL tables with NO POLICIES (deny-all).
--
-- Architecture:
--   - Better Auth connects via DATABASE_URL (direct pg) → bypasses RLS
--   - App queries use service role key (getSupabaseAdmin) → bypasses RLS
--   - No client-side (anon key) table queries exist in this app
--
-- This means RLS serves as defense-in-depth: if the anon key is ever
-- leaked or misused, no data is accessible through the REST API.
--
-- See: migrations/007_enable_rls.sql for the full implementation.

alter table sessions enable row level security;
alter table messages enable row level security;
alter table audit_log enable row level security;
alter table datasets enable row level security;

-- Indexes
create index if not exists idx_sessions_user_id on sessions(user_id);
create index if not exists idx_messages_session_id on messages(session_id);
create index if not exists idx_audit_log_user_id on audit_log(user_id);
create index if not exists idx_audit_log_created_at on audit_log(created_at);
create index if not exists idx_datasets_user_id on datasets(user_id);

-- Demo users (insert via Supabase Auth, then add profiles)
-- admin@pivot.demo / analyst@pivot.demo / viewer@pivot.demo
-- Password for all: demo1234
