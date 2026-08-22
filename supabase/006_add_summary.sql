-- Short summary/excerpt field, distinct from the full "תיאור" (description) — intended for use
-- in the website's event listing/manager, where a brief blurb reads better than the full text.
alter table activities add column if not exists summary text not null default '';
