-- Owner follow-up (2026-09-29): `Combo mix` must sit with the other combo
-- sections, right after `COMBO RAW`, instead of at the end of the catalogue.
-- Reordering only: the new section moves to 16 and the two sections after it
-- shift down by one. No name, price, dish or flag is touched.
--
--   COMBO FRIED 14 · COMBO RAW 15 · Combo mix 16 · SALADS 17 · Sauces 18

update public.categories
set sort_order = case slug
  when 'combo-mix' then 16
  when 'salads'    then 17
  when 'sauces'    then 18
end
where slug in ('combo-mix', 'salads', 'sauces');
