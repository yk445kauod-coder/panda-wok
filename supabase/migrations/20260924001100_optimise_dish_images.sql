-- Optimise dish images for PageSpeed / Core Web Vitals.
--
-- Every menu item pointed at Unsplash's `w=1200&q=75` JPEG. A 1200px JPEG is
-- ~200 KB; the largest render context (dish detail) is ~800px wide, and cards
-- are far smaller. Rewriting the URL query to `w=800&q=70&fm=webp` halves the
-- transfer while keeping the subject sharp, and WebP decodes faster on mobile.
-- The Unsplash photo id is untouched, so this is trivially reversible and can
-- be re-run idempotently.

update public.menu_items
set image_url = regexp_replace(
  image_url,
  '\?[^"'"'"']*$',
  '?w=800&q=70&fm=webp'
)
where image_url like 'https://images.unsplash.com/%'
  and image_url not like '%fm=webp%';