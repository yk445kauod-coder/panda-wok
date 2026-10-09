-- Panda Wok :: tenant FK hardening
-- Every domain table now belongs to exactly one restaurant row.
-- A singleton restaurant is seeded from the brief's publicly known identity;
-- admin can edit it through settings (CMS) instead of code-hardcoding business data.
-- Use the earliest-created active restaurant (same rule as src/lib/services/catalog.ts getRestaurant) so new rows always attach to the live tenant even if an admin later creates a second restaurant row.

create or replace function public.current_restaurant_id()
returns uuid
language sql stable
security definer set search_path = public
as $$
  select id from restaurants where is_active order by created_at asc limit 1;
$$;

grant execute on function public.current_restaurant_id() to anon, authenticated;

insert into restaurants (slug, name_en, name_ar, tagline_en, description_en, city, area, country, currency, cuisine_tags)
values (
  'panda-wok',
  'Panda Wok',
  'باندا ووك',
  'Asian-inspired cloud kitchen in Alexandria',
  'Panda Wok is a mobile-first Asian-inspired cloud kitchen operating in Alexandria, Egypt. Fresh, handcrafted wok, ramen and sushi dishes made to order.',
  'Alexandria',
  null,
  'Egypt',
  'EGP',
  array['asian', 'japanese', 'chinese-inspired']
)
on conflict (slug) do nothing;

-- Add the tenant FK column, backfill against the singleton, then tighten to
-- NOT NULL so the data-safe path also works on databases that already contain rows.

alter table categories
  add column restaurant_id uuid references restaurants(id) on delete cascade;
update categories set restaurant_id = public.current_restaurant_id() where restaurant_id is null;

alter table categories alter column restaurant_id set not null;

alter table menu_items
  add column restaurant_id uuid references restaurants(id) on delete cascade;
update menu_items set restaurant_id = public.current_restaurant_id() where restaurant_id is null;

alter table menu_items alter column restaurant_id set not null;

alter table orders
  add column restaurant_id uuid references restaurants(id) on delete restrict;
update orders set restaurant_id = public.current_restaurant_id() where restaurant_id is null;
alter table orders
alter column restaurant_id set not null;

alter table profiles
  add column restaurant_id uuid references restaurants(id) on delete restrict;
update profiles set restaurant_id = public.current_restaurant_id() where restaurant_id is null;
alter table profiles
alter column restaurant_id set not null;

create index categories_restaurant_idx on categories(restaurant_id);
create index menu_items_restaurant_idx on menu_items(restaurant_id);
create index orders_restaurant_idx on orders(restaurant_id);
create index profiles_restaurant_idx on profiles(restaurant_id);