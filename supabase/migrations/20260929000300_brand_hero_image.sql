-- Home hero background photo.
--
-- `brand.banner_url` was read by `getPublicSettings` but rendered nowhere, so it
-- was a dead key; this is the one actually wired to the hero. It is a public
-- setting so the browser can fetch it directly, and it is edited from
-- Admin -> Settings, whose form groups `settings` rows dynamically — so adding
-- this row is all the admin UI that is needed.
--
-- Absence is meaningful: the hero falls back to the ink-and-lantern gradient when
-- the row is missing or blank, so clearing the value (or deleting the row) is a
-- valid way to remove the photo.
insert into public.settings (key, value, description, is_public)
values (
  'brand.hero_url',
  '"https://ik.imagekit.io/fpbwa3np7/80a4aa10-bc1b-11f1-8492-0b7b7a467f3b%20(1).png"'::jsonb,
  'Home hero background photo. Leave blank to fall back to the ink gradient.',
  true
)
on conflict (key) do nothing;
