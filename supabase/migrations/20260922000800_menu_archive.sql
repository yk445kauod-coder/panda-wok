-- Panda Wok :: menu archiving
--
-- Deleting a dish would orphan order history and break repeated orders, so a
-- dish is archived instead: hidden from customers and from the active admin
-- list, while every past order keeps its snapshot intact.

alter table menu_items
  add column if not exists is_archived boolean not null default false;

-- The admin menu list filters on this, and the catalogue never wants archived
-- rows, so index the predicate rather than the whole column.
create index if not exists menu_items_active_idx
  on menu_items (category_id, sort_order)
  where not is_archived;

create index if not exists menu_items_archived_idx
  on menu_items (updated_at desc)
  where is_archived;

comment on column menu_items.is_archived is
  'Soft delete flag. Archived dishes are excluded from browsing and ordering but kept for order history.';
