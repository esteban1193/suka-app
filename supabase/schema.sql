-- suka-app cloud backend: initial schema
-- Run this once in the Supabase SQL Editor (Database > SQL Editor) after creating the project.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / OR REPLACE / DROP...CREATE).

-- ===== Activities (replaces the old localStorage "events" array) =====
-- id is `text`, NOT uuid or a numeric type: the app generates ids client-side as
-- `${Date.now()}-${Math.random().toString(36).slice(2,10)}` everywhere — addEvent, placing a
-- copy, Excel import, etc. An earlier version used `double precision` with plain
-- `Date.now() + Math.random()` ids, but a 13-digit timestamp plus a long random fraction needs
-- more decimal digits than a double can hold, so precision was lost the instant an id was
-- created (and could drift further on each JSON round-trip) — two ids that displayed identically
-- could be different underlying values, making `.eq("id", ...)` silently match zero rows. See
-- supabase/007_fix_activities_id_type_text.sql for the migration that fixed this on production.
create table if not exists activities (
  id text primary key,
  title text not null default '',
  duration integer not null default 30,
  category_key text not null default 'general',
  audiences text[] not null default '{}',
  cost_items jsonb not null default '[]',
  description text not null default '',
  -- Short excerpt for the website's event listing — see supabase/006_add_summary.sql.
  summary text not null default '',
  contact text not null default '',
  contact_phone text not null default '',
  organization text not null default '',
  confirmed boolean not null default false,
  placed boolean not null default false,
  day_index integer,
  time text,
  -- Each item: {id, url, forWebsite, forSocial} — see supabase/005_multi_media.sql for the
  -- migration that replaced the original single image_url/video_url columns with these.
  images jsonb not null default '[]',
  videos jsonb not null default '[]',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== Categories (shared, user-editable list) =====
create table if not exists categories (
  key text primary key,
  name text not null,
  color text not null default '#93c5fd'
);

insert into categories (key, name, color) values
  ('general', 'כללי', '#60a5fa'),
  ('music', 'מוזיקה', '#34d399'),
  ('teaching', 'הוראה', '#fbbf24'),
  ('logistics', 'לוגיסטיקה', '#f87171'),
  ('other', 'אחר', '#a78bfa')
on conflict (key) do nothing;

-- ===== Single-row settings table (schedule start date) =====
-- The boolean PK + check constraint is a standard Postgres trick to enforce exactly one row.
create table if not exists app_settings (
  id boolean primary key default true check (id),
  start_date date not null default current_date
);
insert into app_settings (id, start_date) values (true, current_date)
  on conflict (id) do nothing;

-- ===== Keep updated_at / updated_by fresh automatically =====
create or replace function set_activity_audit_fields() returns trigger as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists activities_audit_fields on activities;
create trigger activities_audit_fields
  before insert or update on activities
  for each row execute function set_activity_audit_fields();

-- ===== RLS: everyone signed in has full access (no roles — matches the "everyone equal" model) =====
-- NOTE: the GRANT below is required in addition to the RLS policy — Postgres checks table-level
-- privileges first, and a policy alone does not grant access without it (this exact omission has
-- caused silent "empty results" bugs in the sibling bti-siddur project more than once).
alter table activities enable row level security;
alter table categories enable row level security;
alter table app_settings enable row level security;

grant select, insert, update, delete on activities to authenticated;
grant select, insert, update, delete on categories to authenticated;
grant select, update on app_settings to authenticated;

drop policy if exists "authenticated full access" on activities;
create policy "authenticated full access" on activities
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on categories;
create policy "authenticated full access" on categories
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read settings" on app_settings;
create policy "authenticated read settings" on app_settings
  for select to authenticated using (true);

drop policy if exists "authenticated update settings" on app_settings;
create policy "authenticated update settings" on app_settings
  for update to authenticated using (true) with check (true);

-- ===== Realtime: lets every open window/tab see changes instantly (replaces the old
-- BroadcastChannel + localStorage "storage" event hack used for the dual-screen feature) =====
-- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS form, so it's wrapped in a check against
-- pg_publication_tables to keep this file safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activities'
  ) then
    alter publication supabase_realtime add table activities;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table categories;
  end if;
end $$;

-- ===== Storage buckets for Phase B (images/video) — created here so the column names above
-- already match; the actual bucket creation happens in the Dashboard (Storage > New bucket),
-- since bucket creation via SQL requires the storage extension's helper functions that vary
-- by Supabase version. See supabase/storage-setup.md (added when we reach Phase B).
