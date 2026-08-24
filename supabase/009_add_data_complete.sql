-- Add data_complete flag to activities (marks whether all event info has been filled in).
-- Run in Supabase SQL Editor (Database > SQL Editor).

alter table activities
  add column if not exists data_complete boolean not null default false;
