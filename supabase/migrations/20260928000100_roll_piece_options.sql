-- Panda Wok :: one roll item with selectable piece-count options
-- The sushi import originally stored 4-piece and 8-piece prices as separate
-- menu_items. Keep one canonical item per roll and make the piece count a
-- required single-select modifier group. The base price is the 4-piece price;
-- the 8-piece option stores only its delta because place_order prices modifiers
-- authoritatively from the live database.
begin;

create temporary table roll_piece_map (
  base_external_id text primary key,
  duplicate_external_id text not null,
  base_slug text not null,
  base_name_en text not null,
  base_name_ar text not null,
  base_price numeric(10, 2) not null,
  eight_price numeric(10, 2) not null
) on commit drop;

insert into roll_piece_map values
  ('menu-item-1@I', 'menu-item-1@J', 'philadelphia-roll', 'Philadelphia Roll', 'فيلادلفيا رول', 215, 410),
  ('menu-item-2@I', 'menu-item-2@J', 'california-caviar', 'California Caviar', 'كاليفورنيا كفيار', 205, 390),
  ('menu-item-3@I', 'menu-item-3@J', 'hanami-roll', 'Hanami Roll', 'هانامي رول', 215, 410),
  ('menu-item-4@I', 'menu-item-4@J', 'new-style-philadelphia', 'New Style Philadelphia', 'نيو ستايل فيلادلفيا', 215, 410),
  ('menu-item-5@I', 'menu-item-5@J', 'dynamite-roll', 'Dynamite Roll', 'داينميت رول', 215, 410),
  ('menu-item-6@I', 'menu-item-6@J', 'veggie-cheese-roll', 'Veggie Cheese Roll', 'رول خضرات وجبنة كريمي', 150, 280);

-- Delete any modifiers attached to either legacy row before removing the
-- duplicate. Existing order snapshots remain intact; the FK intentionally
-- nulls a deleted catalogue reference for old orders.
delete from public.modifier_groups
where menu_item_id in (
  select id from public.menu_items
  where external_id in (select base_external_id from roll_piece_map union all select duplicate_external_id from roll_piece_map)
);

delete from public.menu_items
where external_id in (select duplicate_external_id from roll_piece_map);

update public.menu_items item
set slug = map.base_slug,
    name_en = map.base_name_en,
    name_ar = map.base_name_ar,
    price = map.base_price,
    sort_order = (select min(sort_order) from public.menu_items old where old.external_id = map.base_external_id),
    is_available = true
from roll_piece_map map
where item.external_id = map.base_external_id;

insert into public.modifier_groups (menu_item_id, name_en, name_ar, min_select, max_select, is_required, sort_order)
select item.id, 'Piece count', 'عدد القطع', 1, 1, true, 0
from public.menu_items item
join roll_piece_map map on map.base_external_id = item.external_id;

insert into public.modifier_options (group_id, name_en, name_ar, price_delta, is_available, sort_order)
select group_row.id, '4 Pieces', '4 قطع', 0, true, 0
from public.modifier_groups group_row
join public.menu_items item on item.id = group_row.menu_item_id
join roll_piece_map map on map.base_external_id = item.external_id
where group_row.name_en = 'Piece count'
union all
select group_row.id, '8 Pieces', '8 قطع', map.eight_price - map.base_price, true, 1
from public.modifier_groups group_row
join public.menu_items item on item.id = group_row.menu_item_id
join roll_piece_map map on map.base_external_id = item.external_id
where group_row.name_en = 'Piece count';

commit;
