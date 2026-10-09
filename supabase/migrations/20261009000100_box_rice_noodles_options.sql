-- Panda Wok :: make the Box dishes' "rice or noodles" choice a real, captured option
--
-- The eight Box dishes state their choice only as prose in `description_en`
-- ("your choice of vegetables noodles or vegetables rice ..."). With no
-- `modifier_groups` row, the customer was never asked and nothing was stored, so
-- the kitchen received "Sweet & Sour Chicken Box" with no idea whether rice or
-- noodles was wanted. This is the same class of defect the two combo-8 dishes had
-- (see 20260929180000_combo_choice_options.sql); this migration closes it for the
-- whole Box category, not one dish.
--
-- `Double Box` also carries a second prose choice ("your choice of sauce
-- (sweet&sour - kungpao -oyster)"), so it gets a second group. The other seven
-- boxes have exactly one choice.
--
-- Owner-requested, insert-only and idempotent:
--   * every option name is taken verbatim from the dish's own description text,
--   * no price is invented (every choice costs the same as the dish, delta 0),
--   * the group is created only where it does not already exist for that item,
--   * nothing is deleted or updated.
-- Re-running this file inserts nothing the second time.

begin;

-- Dish -> the choices it offers. `kind` separates the food choice from the
-- sauce choice so both can attach to Double Box without colliding.
create temporary table box_choice_map (
  slug text not null,
  kind text not null,           -- 'base' | 'sauce'
  group_name_en text not null,
  group_name_ar text not null,
  option_name_en text not null,
  option_name_ar text not null,
  sort_order int not null,
  primary key (slug, kind, option_name_en)
) on commit drop;

insert into box_choice_map values
  -- The rice/noodles choice, on all eight boxes.
  ('sweet-sour-chicken-box',        'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables rice',   'أرز بالخضروات',   0),
  ('sweet-sour-chicken-box',        'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables noodles','نودلز بالخضروات', 1),
  ('spicy-kung-pao-chicken-box',    'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables rice',   'أرز بالخضروات',   0),
  ('spicy-kung-pao-chicken-box',    'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables noodles','نودلز بالخضروات', 1),
  ('oyster-chicken-box',            'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables rice',   'أرز بالخضروات',   0),
  ('oyster-chicken-box',            'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables noodles','نودلز بالخضروات', 1),
  ('teriyaki-chicken-box',          'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables rice',   'أرز بالخضروات',   0),
  ('teriyaki-chicken-box',          'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables noodles','نودلز بالخضروات', 1),
  ('teriyaki-beef-box',             'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables rice',   'أرز بالخضروات',   0),
  ('teriyaki-beef-box',             'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables noodles','نودلز بالخضروات', 1),
  ('oyster-beef-box',               'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables rice',   'أرز بالخضروات',   0),
  ('oyster-beef-box',               'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables noodles','نودلز بالخضروات', 1),
  ('bbq-honey-chili-chicken-box',   'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables rice',   'أرز بالخضروات',   0),
  ('bbq-honey-chili-chicken-box',   'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables noodles','نودلز بالخضروات', 1),
  ('double-box',                    'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables rice',   'أرز بالخضروات',   0),
  ('double-box',                    'base',  'Rice or noodles', 'أرز أو نودلز', 'Vegetables noodles','نودلز بالخضروات', 1),
  -- Double Box only: the sauce choice, from its own description.
  ('double-box',                    'sauce', 'Choose your sauce', 'اختر الصوص', 'sweet & sour sauce', 'صوص السويت اند سور', 0),
  ('double-box',                    'sauce', 'Choose your sauce', 'اختر الصوص', 'kung-pao sauce',     'صوص الكنباو الحار',  1),
  ('double-box',                    'sauce', 'Choose your sauce', 'اختر الصوص', 'oyster sauce',       'صوص المحار',         2);

-- One group per (dish, kind), only where the dish exists and no group of that
-- name is already attached — so a second run inserts nothing.
insert into public.modifier_groups (menu_item_id, name_en, name_ar, min_select, max_select, is_required, sort_order)
select distinct item.id, map.group_name_en, map.group_name_ar, 1, 1, true,
       case map.kind when 'base' then 0 else 1 end
from public.menu_items item
join box_choice_map map on map.slug = item.slug
where not exists (
  select 1 from public.modifier_groups existing
  where existing.menu_item_id = item.id
    and existing.name_en = map.group_name_en
);

-- The options, attached to whichever group now exists for that (dish, kind).
insert into public.modifier_options (group_id, name_en, name_ar, price_delta, is_available, sort_order)
select grp.id, map.option_name_en, map.option_name_ar, 0, true, map.sort_order
from public.menu_items item
join box_choice_map map on map.slug = item.slug
join public.modifier_groups grp
  on grp.menu_item_id = item.id
 and grp.name_en = map.group_name_en
where not exists (
  select 1 from public.modifier_options existing
  where existing.group_id = grp.id
    and existing.name_en = map.option_name_en
);

commit;
