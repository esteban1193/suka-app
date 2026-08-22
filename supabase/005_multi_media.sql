-- Replaces single image_url/video_url columns with arrays of {id, url, forWebsite, forSocial}
-- objects, so an activity can have multiple images/videos, each tagged for its intended use
-- (website, social media, both, or neither/general). Safe to re-run.

alter table activities add column if not exists images jsonb not null default '[]';
alter table activities add column if not exists videos jsonb not null default '[]';

-- One-time promotion of any existing single image_url/video_url into the new array columns,
-- so nothing uploaded during initial testing is lost. Idempotent: only runs if the array is
-- still empty and the old column has a value.
update activities
set images = jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'url', image_url, 'forWebsite', false, 'forSocial', false))
where image_url is not null and image_url <> '' and images = '[]'::jsonb;

update activities
set videos = jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'url', video_url, 'forWebsite', false, 'forSocial', false))
where video_url is not null and video_url <> '' and videos = '[]'::jsonb;

alter table activities drop column if exists image_url;
alter table activities drop column if exists video_url;
