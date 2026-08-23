-- Add technical rider fields to activities.
-- Run in Supabase SQL Editor (Database > SQL Editor).
-- Safe to re-run: ALTER COLUMN ... SET DEFAULT is idempotent for these types.

alter table activities
  add column if not exists tech_rider_text text not null default '',
  add column if not exists tech_rider_url  text not null default '';

-- Storage bucket for uploaded rider files (PDF / Word).
-- Create this manually in the Supabase Dashboard:
--   Storage > New bucket > Name: "activity-riders" > Public: true
-- Then add a storage policy so authenticated users can upload:
--   Storage > activity-riders > Policies > New policy > Authenticated can INSERT/SELECT/DELETE
