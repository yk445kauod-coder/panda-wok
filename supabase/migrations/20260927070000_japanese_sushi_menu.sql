-- Japanese sushi menu (8 sections, 32 items, 38 prices), generated from
-- japanese_sushi_menu_cms_import.txt.
--
-- Idempotent: rows are keyed on `external_id` and upserted, which is the
-- manifest's own contract ('upsert by external_id; never duplicate on retry').
-- Price variants are separate menu_items rows, as the manifest instructs.
--
-- The Chinese menu is deliberately untouched: these sections are appended
-- after it (sort_order 10+), so the Japanese menu can be dropped by deleting
-- the rows whose external_id is not null.

alter table public.menu_items add column if not exists external_id text;
-- A plain unique index (not partial): ON CONFLICT cannot infer a partial index,
-- and Postgres already allows many NULLs in a unique index.
create unique index if not exists menu_items_external_id_key
  on public.menu_items (external_id);

insert into public.categories (slug, name_en, name_ar, sort_order, is_enabled)
values ('raw-ura-maki-roll', 'RAW URA MAKI ROLL', 'اورا ماكي رول', 10, true)
on conflict (slug) do update set name_en = excluded.name_en,
  name_ar = excluded.name_ar, sort_order = excluded.sort_order, is_enabled = true;
insert into public.categories (slug, name_en, name_ar, sort_order, is_enabled)
values ('fried-ura-maki-roll', 'FRIED URA MAKI ROLL', 'اورا ماكي رول مقلي', 11, true)
on conflict (slug) do update set name_en = excluded.name_en,
  name_ar = excluded.name_ar, sort_order = excluded.sort_order, is_enabled = true;
insert into public.categories (slug, name_en, name_ar, sort_order, is_enabled)
values ('nigiri-raw-sushi', 'NIGIRI RAW SUSHI', 'نايجيري سوشي', 12, true)
on conflict (slug) do update set name_en = excluded.name_en,
  name_ar = excluded.name_ar, sort_order = excluded.sort_order, is_enabled = true;
insert into public.categories (slug, name_en, name_ar, sort_order, is_enabled)
values ('nigiri-fried-sushi', 'NIGIRI FRIED SUSHI', 'نايجيري سوشي مقلي', 13, true)
on conflict (slug) do update set name_en = excluded.name_en,
  name_ar = excluded.name_ar, sort_order = excluded.sort_order, is_enabled = true;
insert into public.categories (slug, name_en, name_ar, sort_order, is_enabled)
values ('combo-fried', 'COMBO FRIED', 'كومبو مقلي', 14, true)
on conflict (slug) do update set name_en = excluded.name_en,
  name_ar = excluded.name_ar, sort_order = excluded.sort_order, is_enabled = true;
insert into public.categories (slug, name_en, name_ar, sort_order, is_enabled)
values ('combo-raw', 'COMBO RAW', 'كومبو نيء', 15, true)
on conflict (slug) do update set name_en = excluded.name_en,
  name_ar = excluded.name_ar, sort_order = excluded.sort_order, is_enabled = true;
insert into public.categories (slug, name_en, name_ar, sort_order, is_enabled)
values ('salads', 'SALADS', 'سلطات', 16, true)
on conflict (slug) do update set name_en = excluded.name_en,
  name_ar = excluded.name_ar, sort_order = excluded.sort_order, is_enabled = true;
insert into public.categories (slug, name_en, name_ar, sort_order, is_enabled)
values ('sauces', 'Sauces', 'صوصات', 17, true)
on conflict (slug) do update set name_en = excluded.name_en,
  name_ar = excluded.name_ar, sort_order = excluded.sort_order, is_enabled = true;

insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-1@I', 'philadelphia-roll-8-pieces', c.id, 'philadelphia roll (8 pieces)', 'فلاديلفيا رول (8 قطعة)',
  'fresh salmon, smoked salmon, creamy cheese, avocado, cucumber, teriyaki sauce', 'سلمون فريش - سلمون مدخن  - جبنه كريمي - افوكادو - خيار- صوص ترياكي', 410, 0, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-1@J', 'philadelphia-roll-4-pieces', c.id, 'philadelphia roll (4 pieces)', 'فلاديلفيا رول (4 قطعة)',
  'fresh salmon, smoked salmon, creamy cheese, avocado, cucumber, teriyaki sauce', 'سلمون فريش - سلمون مدخن  - جبنه كريمي - افوكادو - خيار- صوص ترياكي', 215, 1, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-2@I', 'california-caviar-8-pieces', c.id, 'california caviar (8 pieces)', 'كاليفورنيا كفيار (8 قطعة)',
  'crab, caviar, avocado, cucumber, mayonnaise sauce, teriyaki sauce', 'كابوريا - كفيار - افوكادو - خيار - صوص مايونيز - صوص ترياكي', 390, 2, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-2@J', 'california-caviar-4-pieces', c.id, 'california caviar (4 pieces)', 'كاليفورنيا كفيار (4 قطعة)',
  'crab, caviar, avocado, cucumber, mayonnaise sauce, teriyaki sauce', 'كابوريا - كفيار - افوكادو - خيار - صوص مايونيز - صوص ترياكي', 205, 3, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-3@I', 'hanami-roll-8-pieces', c.id, 'hanami roll (8 pieces)', 'هانامي رول (8 قطعة)',
  'fresh salmon, shrimps, avocado, cucmber, sesame, teriyaki sauce', 'سلمون فريش - جمبري - افوكادو - خيار - سمسم - - ترياكي صوص', 410, 4, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-3@J', 'hanami-roll-4-pieces', c.id, 'hanami roll (4 pieces)', 'هانامي رول (4 قطعة)',
  'fresh salmon, shrimps, avocado, cucmber, sesame, teriyaki sauce', 'سلمون فريش - جمبري - افوكادو - خيار - سمسم - - ترياكي صوص', 215, 5, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-4@I', 'new-style-philadelphia-8-pieces', c.id, 'new style philadelphia (8 pieces)', 'نيو ستايل فلاديلفيا (8 قطعة)',
  'shrimps, crab, creamy cheese, avocado, cucumber, mayonnaise sauce,', 'جمبري - كابوريا - جبنه كريمي - افوكادو - خيار- صوص مايونيز', 410, 6, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-4@J', 'new-style-philadelphia-4-pieces', c.id, 'new style philadelphia (4 pieces)', 'نيو ستايل فلاديلفيا (4 قطعة)',
  'shrimps, crab, creamy cheese, avocado, cucumber, mayonnaise sauce,', 'جمبري - كابوريا - جبنه كريمي - افوكادو - خيار- صوص مايونيز', 215, 7, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-5@I', 'dynamite-roll-8-pieces', c.id, 'dynamite roll (8 pieces)', 'داينميت رول (8 قطعة)',
  'crab, shrimps, smoked salmon, creamy cheese, avocado, cucmber, spicy mayonnaise sauce', 'كابوريا - جمبري - سلمون مدخن - جبنه كريمي - افوكادو - خيار - صوص مايونيز اسبايسي', 410, 8, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-5@J', 'dynamite-roll-4-pieces', c.id, 'dynamite roll (4 pieces)', 'داينميت رول (4 قطعة)',
  'crab, shrimps, smoked salmon, creamy cheese, avocado, cucmber, spicy mayonnaise sauce', 'كابوريا - جمبري - سلمون مدخن - جبنه كريمي - افوكادو - خيار - صوص مايونيز اسبايسي', 215, 9, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-6@I', 'veggie-cheese-roll-8-pieces', c.id, 'veggie cheese roll (8 pieces)', 'رول خضرات وجبنه كريمي (8 قطعة)',
  'creamy cheese, carrots, cucumber , sesame, teriyaki sauce,', 'جبنه كريمي - جزر - خيار - سمسم - ترياكي صوص', 280, 10, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-6@J', 'veggie-cheese-roll-4-pieces', c.id, 'veggie cheese roll (4 pieces)', 'رول خضرات وجبنه كريمي (4 قطعة)',
  'creamy cheese, carrots, cucumber , sesame, teriyaki sauce,', 'جبنه كريمي - جزر - خيار - سمسم - ترياكي صوص', 150, 11, true
  from public.categories c where c.slug = 'raw-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-7@I', 'spicy-lemon-roll', c.id, 'spicy lemon roll', 'اورا ماكي مقلي بصوص الليمون',
  'fresh salmon, shrimps, crab, creamy cheese, avocado, spicy mayonnaise sauce', 'سلمون فريش - جمبري -كابوريا - جبنه كريمي  - افوكادو - صوص اسبايسي مايونيز', 400, 0, true
  from public.categories c where c.slug = 'fried-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-8@I', 'golden-amazing-roll', c.id, 'golden amazing roll', 'جولدن اميزينج رول',
  'shrimps, smoked salmon, avocado, cheddar cheese, spicy mayonnaise sauce, olive sauce', 'جمبري - سلمون مدخن - افوكادو - جبنة شيدر - صوص اسبايسي مايونيز - صوص زيتون كالاماتا', 400, 1, true
  from public.categories c where c.slug = 'fried-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-9@I', 'halloween-roll', c.id, 'halloween roll', 'هالوين رول',
  'fresh salmon, crab, avocado, teriyaki sauce, spicy mayonnaise sauce,', 'سلمون فريش - كابوريا - افوكادو - ترياكي صوص - اسبايسي مايونيز صوص', 390, 2, true
  from public.categories c where c.slug = 'fried-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-10@I', 'fried-cavier-roll', c.id, 'fried cavier roll', 'رول كفيار مقلي',
  'shrimps, crab, cavier, avocado, mayonnaise sauce,', 'جمبري - كابوريا - كفيار - افوكادو - صوص مايونيز', 390, 3, true
  from public.categories c where c.slug = 'fried-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-11@I', 'shrimps-dynamite-roll', c.id, 'shrimps dynamite roll', 'رول جمبري داينميت',
  'shrimps, moked salmon, creamy cheese, avocdo, teriyaki sauce,', 'جمبري - سلمون مدخن - جبنة كريمي - افوكادو - صوص ترياكي', 400, 4, true
  from public.categories c where c.slug = 'fried-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-12@I', 'fried-vggie-cheese-roll', c.id, 'fried vggie cheese roll', 'رول خضروات وجبنة كريمي مقلي',
  'cremy cheese, avocado, carrots, mayonnaise sauce,', 'جبنه كريمي - افوكادو - جزر- صوص مايونيز', 290, 5, true
  from public.categories c where c.slug = 'fried-ura-maki-roll'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-13@I', 'shrimp-nigiri-1-piece', c.id, 'shrimp nigiri (1 piece)', 'جمبري نايجيري (1 قطعة)',
  null, null, 45, 0, true
  from public.categories c where c.slug = 'nigiri-raw-sushi'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-14@I', 'salmon-nigiri-1-piece', c.id, 'salmon nigiri (1 piece)', 'سلمون نايجيري (1 قطعة)',
  null, null, 45, 1, true
  from public.categories c where c.slug = 'nigiri-raw-sushi'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-15@I', 'crab-nigiri-1-piece', c.id, 'crab nigiri (1 piece)', 'كابوريا نايجيري (1 قطعة)',
  null, null, 35, 2, true
  from public.categories c where c.slug = 'nigiri-raw-sushi'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-16@I', 'fried-shrimp-nigiri-1-piece', c.id, 'fried shrimp nigiri (1 piece)', 'جمبري نايجيري مقلي (1 قطعة)',
  null, null, 48, 0, true
  from public.categories c where c.slug = 'nigiri-fried-sushi'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-17@I', 'fried-salmon-nigiri-1-piece', c.id, 'fried salmon nigiri (1 piece)', 'سلمون نايجيري مقلي (1 قطعة)',
  null, null, 48, 1, true
  from public.categories c where c.slug = 'nigiri-fried-sushi'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-18@I', 'fried-crab-nigiri-1-piece', c.id, 'fried crab nigiri (1 piece)', 'كابوريا نايجيري مقلي (1 قطعة)',
  null, null, 38, 2, true
  from public.categories c where c.slug = 'nigiri-fried-sushi'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-19@I', 'combo-fried-8-pieces', c.id, 'combo fried 8 pieces', 'كومبو مقلي 8 قطع',
  'your choice:  (4pc fried halloween roll) or (4pcs shrimps dynamite roll) + 4pcs veggie roll', 'اختيارك من: (4 قطع هالوين رول مقلي) او (4 قطع رول جمبري داينميت مقلي ) + 4 قطع رول خضروات', 340, 0, true
  from public.categories c where c.slug = 'combo-fried'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-20@I', 'combo-fried-16-pieces', c.id, 'combo fried 16 pieces', 'كومبو مقلي 16 قطع',
  '6pcs spicy lemon roll & 4pcs halloween roll & 6pcs fried vggie cheese roll', 'عدد 6 قطع سبايسي ليمون & عدد 4 قطع هالوين رول & عدد6 قطع رول خضروت مقلي مع الجبنة الكريمي', 540, 1, true
  from public.categories c where c.slug = 'combo-fried'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-21@I', 'combo-fried-24-pieces', c.id, 'combo fried 24 pieces', 'كومبو مقلي 24 قطع',
  '6pcs shrimps dynamite roll & 6pcs golden amazing roll & 6pcs halloween roll & 6pcs fried veggie cheese roll', 'عدد6 قطع جمبري داينميت & عدد6قطع جولدن اميزينج & عدد 6 قطع هالوين رول & عدد 6قطع رول خضروات مقلية بالجبنة الكريمي', 820, 2, true
  from public.categories c where c.slug = 'combo-fried'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-22@I', 'combo-fried-32-pieces', c.id, 'combo fried 32 pieces', 'كومبو مقلي 32 قطع',
  '6pcs fried cavier roll & 6pcs shrimps dynamite roll & 6pcs halloween roll & 6pcs golden amazing roll & 8pcs fried veggie cheese roll', 'عدد 6 قطع رول كفيار مقلي & عدد 6 قطع جمبري داينميت مقلي & عدد 6قطع هالوين رول & عدد6 قطع جولدن اميزينج رول & عدد 8 قطع رول خضروات مقلية بالجبنة الكريمي', 1048, 3, true
  from public.categories c where c.slug = 'combo-fried'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-23@I', 'combo-8-pieces', c.id, 'combo 8 pieces', 'كومبو 8 قطع',
  'your choice: 4pcs california caviar or 4pcs new style philadelphia + 4pcs creamy cheese veggie roll', 'اختيارك من: (4 قطع كاليفورنيا كفيار) او (4 قطع نيو ستايل فلاديلفيا) + 4 قطع رول خضروات', 348, 0, true
  from public.categories c where c.slug = 'combo-raw'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-24@I', 'combo-16-pieces', c.id, 'combo 16 pieces', 'كومبو  16 قطع',
  '4pcs philadelphia roll & 4pcs new style philadelphia & 8pcs veggie cheese roll', 'عدد 4 قطع فلاديلفيا رول & عدد عدد 4قطع نيو ستايل فلاديلفيا رول & عدد 8 قطع رول خضروات بالجبنة الكريمي', 540, 1, true
  from public.categories c where c.slug = 'combo-raw'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-25@I', 'combo-24-pieces', c.id, 'combo 24 pieces', 'كومبو 24 قطع',
  '8pcs california caviar roll & 8pcs hanami roll & 8pcs veggie cheese roll', 'عدد 8 قطع كاليفورنيا كفيار رول & عدد 8 قطع هانامي رول & عدد 8 قطع رول خضروات بالجبنة الكريمي', 820, 2, true
  from public.categories c where c.slug = 'combo-raw'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-26@I', 'combo-32-pieces', c.id, 'combo 32 pieces', 'كومبو 32 قطع',
  '8pcs new style philadelphia roll & 8pcs california caviar roll & 8pcs philadelphia roll & 8pcs veggie cheese roll', 'عدد 8 قطع نيو ستايل فلاديلفيا & عدد 8 قطع كاليفورنيا كفيار & عدد 8 قطع فلاديلفيا رول & عدد 8 قطع رول خضروات بالجبنة الكريمي', 1048, 3, true
  from public.categories c where c.slug = 'combo-raw'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-27@I', 'combo-mix-48-pieces', c.id, 'combo mix 48 pieces', 'كومبو ميكس 48 قطعة',
  '6pcs spicy lemon roll & 6pcs shrimps dynamite roll & 6pcs halloween roll & 8pcs california caviar & 8pcs hanami roll & 8pcs veggie cheese roll & 6pcs fried vggie cheese roll', 'عدد 6 قطع سبايسي ليمون مقلي & عدد 6 قطع ديناميت جمبري مقلي & عدد 6 قطع هالوبن رول مقلي & عدد 8 قطع كاليفورنيا كفيار رول & عدد 8 قطع هانامي رول & عدد 8 قطع رول خضروات بالجبنة الكريمي & عدد 6 قطع رول خضروات مقلي', 1540, 4, true
  from public.categories c where c.slug = 'combo-raw'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-28@I', 'shrimps-avocado-creamy-cheese-carrots-cucumber-mayonnaise-spicy-mayonnaise', c.id, 'shrimps, avocado, creamy cheese, carrots, cucumber, mayonnaise, spicy mayonnaise', 'جمبري - افوكادو - جبنة كريمي - جزر - خيار - مايونيز - سبايسي مايونيز',
  null, null, 375, 0, true
  from public.categories c where c.slug = 'salads'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-29@I', 'japanese-crab-salad', c.id, 'japanese crab salad', 'سلطة الكابوريا اليابانية',
  'crab, avocado, carrots, cucumber, mayonnaise, spicy mayonnaise', 'كابوريا - افوكادو - جزر - خيار - مايونيز - سبايسي مايونيز', 275, 1, true
  from public.categories c where c.slug = 'salads'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-30@I', 'spicy-mayonnaise-sauce', c.id, 'Spicy Mayonnaise Sauce', 'سبايسي مايونيز صوص',
  null, null, 40, 0, true
  from public.categories c where c.slug = 'sauces'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-31@I', 'wasabi', c.id, 'Wasabi', 'واسابي',
  null, null, 40, 1, true
  from public.categories c where c.slug = 'sauces'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;
insert into public.menu_items
  (external_id, slug, category_id, name_en, name_ar,
   description_en, description_ar, price, sort_order, is_available)
select 'menu-item-32@I', 'pickled-ginger', c.id, 'Pickled  Ginger', 'جنزبيل مخلل',
  null, null, 40, 2, true
  from public.categories c where c.slug = 'sauces'
on conflict (external_id) do update set
  slug = excluded.slug, category_id = excluded.category_id,
  name_en = excluded.name_en, name_ar = excluded.name_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  price = excluded.price, sort_order = excluded.sort_order,
  is_available = true;

-- 8 sections, 38 menu_items rows
