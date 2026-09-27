-- Re-enable the Japanese sushi menu.
--
-- 20260927170000_hide_japanese_menu.sql turned the sushi categories off on the
-- assumption that the Japanese menu was not ready to show. The owner has since
-- said that was wrong: the sushi menu is to be visible alongside the Chinese
-- menu. This flips the same flag back on — no row is added or removed, so the
-- 38 dishes, their modifiers and prices are exactly as they were.
--
-- Idempotent: re-running is a no-op because it sets the same value.

update public.categories
set is_enabled = true
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
