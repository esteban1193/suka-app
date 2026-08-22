-- ONE-OFF fix, run exactly once, then never again.
-- The `activities` table was first created with a `uuid` id column; the app actually generates
-- ids client-side as `Date.now() + Math.random()` (a JS number), so it needs to be
-- `double precision` instead. Safe right now only because the table has never held real data.
--
-- After running this once, re-run schema.sql to recreate the table with the corrected type
-- (schema.sql itself contains no destructive statements and is safe to re-run any time).

drop table if exists activities cascade;
