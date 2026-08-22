-- Switches Realtime from the classic `postgres_changes` (Postgres CDC-based) mechanism to
-- "Broadcast from Database" — a trigger explicitly broadcasts a message on every write, instead
-- of relying on Postgres's logical-replication change feed. Safe to re-run.
--
-- Why: postgres_changes was set up correctly (publication membership confirmed, RLS policies in
-- place) but never delivered a single event to any connected client, despite the Realtime
-- service itself showing real message traffic in the project's usage stats. Broadcast is a
-- different delivery path end-to-end, so this either fixes it or narrows down where the problem
-- actually is.

create or replace function public.broadcast_table_changes()
returns trigger
language plpgsql
as $$
begin
  perform realtime.broadcast_changes(
    'schedule-changes',              -- topic — must match the channel name the client subscribes to
    tg_op,                           -- event name (INSERT/UPDATE/DELETE)
    tg_op,                           -- operation
    tg_table_name,                   -- table
    tg_table_schema,                 -- schema
    new,                             -- new row (null on DELETE)
    old                              -- old row (null on INSERT)
  );
  return null;
end;
$$;

drop trigger if exists activities_broadcast on activities;
create trigger activities_broadcast
  after insert or update or delete on activities
  for each row execute function public.broadcast_table_changes();

drop trigger if exists categories_broadcast on categories;
create trigger categories_broadcast
  after insert or update or delete on categories
  for each row execute function public.broadcast_table_changes();

-- Authorization: a "private" Realtime channel checks RLS on realtime.messages for the topic.
-- Matches the "everyone signed in has full access" model used everywhere else in this app.
-- Note: realtime.messages is a Supabase-managed system table with RLS already enabled by
-- default — project accounts can create policies on it but cannot run ALTER TABLE on it
-- ("must be owner of table messages" if you try), so there's no enable-RLS statement here.

drop policy if exists "authenticated can read schedule broadcasts" on realtime.messages;
create policy "authenticated can read schedule broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (true);
