-- Panda Wok :: turn the two combo-8 "your choice" notes into real options
--
-- `combo 8 pieces` and `combo fried 8 pieces` carried their choice only as
-- prose in `description_en` ("your choice: 4pcs california caviar or 4pcs new
-- style philadelphia + ..."), so the customer was never asked to pick and the
-- kitchen could not see which roll was wanted. This adds a required
-- single-select group per combo, exactly like the existing "Size" / "Choose
-- your protein" groups.
--
-- Owner-requested, insert-only and idempotent: the group name and every option
-- name are taken verbatim from the item's own description text, no price is
-- invented (both choices cost the same as the combo, so the delta is 0), and
-- re-running it changes nothing because the insert is guarded on the group not
-- already existing for that item. Nothing is deleted or updated.
begin;

create temporary table combo_choice_map (
  slug text not null,
  group_name_en text not null,
  group_name_ar text not null,
  option_name_en text not null,
  option_name_ar text not null,
  sort_order int not null,
  primary key (slug, option_name_en)
) on commit drop;

insert into combo_choice_map values
  ('combo-8-pieces', 'Your choice', 'اختيارك من',
   'California Caviar (4 pieces)', 'كاليفورنيا كفيار (4 قطع)', 0),
  ('combo-8-pieces', 'Your choice', 'اختيارك من',
   'New Style Philadelphia (4 pieces)', 'نيو ستايل فلاديلفيا (4 قطع)', 1),
  ('combo-fried-8-pieces', 'Your choice', 'اختيارك من',
   'Fried Halloween Roll (4 pieces)', 'هالوين رول مقلي (4 قطع)', 0),
  ('combo-fried-8-pieces', 'Your choice', 'اختيارك من',
   'Shrimps Dynamite Roll (4 pieces)', 'رول جمبري داينميت مقلي (4 قطع)', 1);

-- One group per combo, only where the combo exists and has no group of that
-- name yet (so a second run inserts nothing).
insert into public.modifier_groups (menu_item_id, name_en, name_ar, min_select, max_select, is_required, sort_order)
select distinct item.id, map.group_name_en, map.group_name_ar, 1, 1, true, 0
from public.menu_items item
join combo_choice_map map on map.slug = item.slug
where not exists (
  select 1 from public.modifier_groups existing
  where existing.menu_item_id = item.id
    and existing.name_en = map.group_name_en
);

-- The options, attached to whichever group now exists for that combo.
insert into public.modifier_options (group_id, name_en, name_ar, price_delta, is_available, sort_order)
select grp.id, map.option_name_en, map.option_name_ar, 0, true, map.sort_order
from public.menu_items item
join combo_choice_map map on map.slug = item.slug
join public.modifier_groups grp
  on grp.menu_item_id = item.id
 and grp.name_en = map.group_name_en
where not exists (
  select 1 from public.modifier_options existing
  where existing.group_id = grp.id
    and existing.name_en = map.option_name_en
);

commit;
