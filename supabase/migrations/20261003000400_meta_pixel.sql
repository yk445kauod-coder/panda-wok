-- Owner request: install the Meta (Facebook) Pixel so ad clicks can be measured.
--
-- Two flat settings, not one jsonb blob: the generic settings form renders a
-- string field and a boolean switch automatically (jsonb only gets a raw JSON
-- textarea), so the owner can paste the Pixel ID and flip tracking on/off from
-- Admin -> Settings with no deploy and no JSON.
--
-- Both are `is_public`: the browser needs the id to initialise the pixel, and
-- the id is not a secret -- it ships in the page source by design, unlike the
-- Conversions API access token, which is a server-side secret stored elsewhere.
--
-- Idempotent: inserts only when the key is absent, so re-running never
-- overwrites what the owner has set, and the legacy single-blob key (if a prior
-- run created it) is removed.
insert into public.settings (key, value, description, is_public)
select 'marketing.meta_pixel_id',
       '""'::jsonb,
       'Meta (Facebook) Pixel ID from Meta Events Manager. Leave empty to disable.',
       true
where not exists (select 1 from public.settings where key = 'marketing.meta_pixel_id');

insert into public.settings (key, value, description, is_public)
select 'marketing.meta_pixel_enabled',
       'true'::jsonb,
       'Send Meta Pixel events (PageView, AddToCart, Purchase) to the Facebook pixel above.',
       true
where not exists (select 1 from public.settings where key = 'marketing.meta_pixel_enabled');

-- Set the owner's live pixel and turn it on.
update public.settings
   set value = to_jsonb('1626139359047880'::text)
 where key = 'marketing.meta_pixel_id'
   and value = '""'::jsonb;

update public.settings
   set value = 'true'::jsonb
 where key = 'marketing.meta_pixel_enabled';

-- Remove the earlier jsonb blob form if this migration is re-run after it.
delete from public.settings where key = 'marketing.meta_pixel';
