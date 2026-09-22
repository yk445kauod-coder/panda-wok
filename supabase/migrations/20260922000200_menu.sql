-- Panda Wok :: menu domain
-- Categories, items, images, modifiers, upsell rules, ingredients.

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ar text,
  tagline_en text,
  tagline_ar text,
  description_en text,
  description_ar text,
  story_md text,
  cuisine_tags text[] not null default '{}',
  city text,
  area text,
  country text default 'Egypt',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  phone text,
  whatsapp text,
  email text,
  social jsonb not null default '{}'::jsonb,
  opening_hours jsonb not null default '{}'::jsonb,
  currency text not null default 'EGP',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text,
  name_ja text,
  slug text not null unique,
  description_en text,
  description_ar text,
  image_url text,
  seo_title text,
  seo_description text,
  sort_order int not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_sort_idx on categories (is_enabled, sort_order);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories (id) on delete restrict,
  name_en text not null,
  name_ar text,
  name_ja text,
  slug text not null unique,
  description_en text,
  description_ar text,
  price numeric(10, 2) not null check (price >= 0),
  compare_at_price numeric(10, 2) check (compare_at_price is null or compare_at_price >= 0),
  is_available boolean not null default true,
  is_featured boolean not null default false,
  is_spicy boolean not null default false,
  is_vegetarian boolean not null default false,
  is_vegan boolean not null default false,
  contains_nuts boolean not null default false,
  prep_minutes int not null default 15 check (prep_minutes between 0 and 240),
  calories int check (calories is null or calories >= 0),
  allergens text[] not null default '{}',
  ingredients text[] not null default '{}',
  image_url text,
  image_alt text,
  has_transparent_png boolean not null default false,
  sort_order int not null default 0,
  seo_title text,
  seo_description text,
  seo_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_category_idx on menu_items (category_id, sort_order);
create index menu_items_available_idx on menu_items (is_available) where is_available;
create index menu_items_featured_idx on menu_items (is_featured) where is_featured;
create index menu_items_name_trgm_idx on menu_items using gin (name_en gin_trgm_ops);

create table menu_images (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items (id) on delete cascade,
  storage_path text,
  external_url text,
  alt_en text,
  alt_ar text,
  role text not null default 'gallery' check (role in ('primary', 'gallery', 'thumbnail', 'transparent')),
  width int,
  height int,
  format text,
  bytes int,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);
create index menu_images_item_idx on menu_images (menu_item_id, sort_order);

create table modifier_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items (id) on delete cascade,
  name_en text not null,
  name_ar text,
  min_select int not null default 0,
  max_select int not null default 1,
  is_required boolean not null default false,
  sort_order int not null default 0
);

create table modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references modifier_groups (id) on delete cascade,
  name_en text not null,
  name_ar text,
  price_delta numeric(10, 2) not null default 0,
  is_available boolean not null default true,
  sort_order int not null default 0
);

-- Upsell: "when item/category X is in cart, suggest item/category Y".
create table upsell_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_kind text not null check (trigger_kind in ('item', 'category')),
  trigger_menu_item_id uuid references menu_items (id) on delete cascade,
  trigger_category_id uuid references categories (id) on delete cascade,
  suggest_kind text not null check (suggest_kind in ('item', 'category')),
  suggest_menu_item_id uuid references menu_items (id) on delete cascade,
  suggest_category_id uuid references categories (id) on delete cascade,
  headline_en text,
  headline_ar text,
  discount_percent numeric(5, 2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  priority int not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (trigger_kind = 'item' and trigger_menu_item_id is not null and trigger_category_id is null)
    or (trigger_kind = 'category' and trigger_category_id is not null and trigger_menu_item_id is null)
  ),
  check (
    (suggest_kind = 'item' and suggest_menu_item_id is not null and suggest_category_id is null)
    or (suggest_kind = 'category' and suggest_category_id is not null and suggest_menu_item_id is null)
  )
);
create index upsell_rules_trigger_item_idx on upsell_rules (trigger_menu_item_id) where is_enabled;
create index upsell_rules_trigger_cat_idx on upsell_rules (trigger_category_id) where is_enabled;

create trigger categories_touch before update on categories
  for each row execute function public.touch_updated_at();
create trigger menu_items_touch before update on menu_items
  for each row execute function public.touch_updated_at();
create trigger upsell_rules_touch before update on upsell_rules
  for each row execute function public.touch_updated_at();
