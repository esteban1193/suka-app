-- Add logo_url field to activities (single transparent PNG logo per event).
-- Run in Supabase SQL Editor (Database > SQL Editor).

alter table activities
  add column if not exists logo_url text not null default '';
