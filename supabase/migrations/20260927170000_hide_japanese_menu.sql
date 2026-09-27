-- The Japanese sushi menu (categories sort_order 10-17, seeded by
-- 20260927070000_japanese_sushi_menu.sql) is live and visible to customers
-- right now, mixed in with the Chinese menu. The owner's brief is that the
-- Chinese menu is the one being launched and the Japanese one is not ready
-- yet, so the sushi categories are disabled rather than deleted.
--
-- `is_enabled = false` is enough: `getPublicMenu()` filters items down to
-- enabled categories, so hiding the category hides its 38 dishes too. The rows
-- and their images/modifiers stay intact, so re-enabling is one flag when the
-- sushi menu is approved.

update public.categories
set is_enabled = false
where slug in (
  'raw-ura-maki-roll',
  'fried-ura-maki-roll',
  'nigiri-raw-sushi',
  'nigiri-fried-sushi',
  'combo-fried',
  'combo-raw',
  'salads',
  'sauces'
);
