-- Owner request: the Facebook page link changed.
--
-- Only the `facebook` key inside `support.social` is touched. The row is merged
-- with `||` so the sibling keys (tiktok, instagram) and any future channel are
-- preserved, and re-running this migration is a no-op. The link then flows to
-- every surface from this one setting: the homepage footer, the contact page,
-- the brand banner, the mobile footer and the JSON-LD `sameAs` list.
update public.settings
set value = value || jsonb_build_object(
      'facebook',
      'https://www.facebook.com/share/1JrgXPtHet/'
    ),
    updated_at = now()
where key = 'support.social';
