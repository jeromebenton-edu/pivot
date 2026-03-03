-- Pivot Enterprise Schema
-- Run this in the Supabase SQL Editor

-- Profiles (extends Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text,
  role text default 'viewer' check (role in ('admin','analyst','viewer')),
  created_at timestamptz default now()
);

-- Chat sessions
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
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
  user_id uuid references profiles(id),
  action text not null,
  details jsonb,
  ip_address text,
  created_at timestamptz default now()
);

-- Datasets (for Phase 3)
create table if not exists datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('builtin','csv','excel','database')),
  row_count integer,
  columns jsonb,
  created_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table sessions enable row level security;
alter table messages enable row level security;
alter table audit_log enable row level security;
alter table datasets enable row level security;

-- Policies
create policy "Users can view own profile"
  on profiles for select using (id = auth.uid());

create policy "Users can update own profile"
  on profiles for update using (id = auth.uid());

create policy "Users see own sessions"
  on sessions for all using (user_id = auth.uid());

create policy "Users see own messages"
  on messages for all using (
    session_id in (select id from sessions where user_id = auth.uid())
  );

create policy "Admins see all audit logs"
  on audit_log for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "System can insert audit logs"
  on audit_log for insert with check (true);

create policy "Users see own datasets"
  on datasets for all using (user_id = auth.uid());

-- Indexes
create index if not exists idx_sessions_user_id on sessions(user_id);
create index if not exists idx_messages_session_id on messages(session_id);
create index if not exists idx_audit_log_user_id on audit_log(user_id);
create index if not exists idx_audit_log_created_at on audit_log(created_at);
create index if not exists idx_datasets_user_id on datasets(user_id);

-- Demo users (insert via Supabase Auth, then add profiles)
-- admin@pivot.demo / analyst@pivot.demo / viewer@pivot.demo
-- Password for all: demo1234
