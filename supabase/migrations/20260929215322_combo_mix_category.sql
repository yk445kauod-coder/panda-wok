-- Owner request (2026-09-29): give `combo mix 48 pieces` its own category,
-- named "Combo mix". Additive and idempotent: one category is inserted, then the
-- single dish is repointed. Nothing is deleted; `COMBO RAW` keeps its other four
-- dishes and both catalogues stay public.
--
-- The section's final position is set by 20260929215655_combo_mix_category_order.sql.

insert into public.categories (name_en, name_ar, slug, sort_order, is_enabled)
select 'Combo mix', 'كومبو ميكس', 'combo-mix', 18, true
where not exists (select 1 from public.categories where slug = 'combo-mix');

update public.menu_items
set category_id = (select id from public.categories where slug = 'combo-mix')
where slug = 'combo-mix-48-pieces'
  and category_id is distinct from (select id from public.categories where slug = 'combo-mix');
