-- Panda Wok :: seed reference data
-- NOTE: the restaurant row carries only verifiable identity facts (name, city,
-- country, cuisine). Phone numbers, social handles, opening hours, street
-- address and coordinates are intentionally left null for the operator to fill
-- in from Admin -> Settings. Nothing in this file invents a business claim.
-- Menu prices are placeholder EGP values for a starter menu and are expected
-- to be replaced by the operator.

insert into restaurants (slug, name_en, tagline_en, description_en, cuisine_tags, city, country, currency, story_md, social, opening_hours)
values (
  'panda-wok',
  'Panda Wok',
  'Asian kitchen, crafted to order',
  'Panda Wok is a cloud kitchen in Alexandria, Egypt, cooking Asian-inspired food to order: wok dishes, ramen, sushi and izakaya-style starters.',
  array['Asian', 'Japanese-inspired', 'Chinese-inspired', 'Wok', 'Ramen', 'Sushi', 'Cloud kitchen'],
  'Alexandria',
  'Egypt',
  'EGP',
  'Panda Wok started with a simple idea: a small kitchen that treats fast food like slow craft. Everything is cooked to order in one wok station and one sushi counter, so the food arrives the way it was intended to be eaten.

We lean on Japanese and Chinese technique rather than shortcuts: high heat, short cook times, clean seasoning, and a broth that takes hours instead of minutes.',
  '{}'::jsonb,
  '{}'::jsonb
)
on conflict (slug) do nothing;

insert into categories (name_en, name_ar, name_ja, slug, description_en, seo_title, seo_description, sort_order)
values
  ('Sushi', 'سوشي', '寿司', 'sushi',
   'Nigiri-style bites and rolls built to order on seasoned rice.',
   'Sushi in Alexandria | Panda Wok',
   'Order freshly made sushi from Panda Wok in Alexandria. Rolls and nigiri prepared to order for delivery or pickup.',
   1),
  ('Wok', 'ووك', '中華鍋', 'wok',
   'High-heat wok plates with noodles, rice and vegetables.',
   'Wok dishes in Alexandria | Panda Wok',
   'Noodles, rice and vegetable wok plates cooked to order over high heat. Available for delivery in Alexandria.',
   2),
  ('Ramen', 'رامن', 'ラーメン', 'ramen',
   'Slow-cooked broth, fresh noodles and toppings layered in the bowl.',
   'Ramen in Alexandria | Panda Wok',
   'Slow-cooked ramen bowls from Panda Wok in Alexandria. Order for delivery or pickup.',
   3),
  ('Appetizers', 'المقبلات', '居酒屋', 'appetizers',
   'Small izakaya-style plates made for sharing before the main bowl.',
   'Asian appetizers and izakaya starters | Panda Wok',
   'Sharing plates and izakaya-style starters from Panda Wok in Alexandria. Perfect to start an order.',
   4),
  ('Drinks', 'المشروبات', '飲み物', 'drinks',
   'Cold teas and soft drinks to balance the heat.',
   'Drinks | Panda Wok',
   'Cold teas and soft drinks from Panda Wok in Alexandria, delivered with your food.',
   5)
on conflict (slug) do nothing;

with cat as (select id, slug from categories)
insert into menu_items (
  category_id, name_en, name_ar, name_ja, slug, description_en,
  price, is_available, is_featured, is_spicy, is_vegetarian, is_vegan, contains_nuts,
  prep_minutes, calories, ingredients, allergens, image_url, image_alt,
  has_transparent_png, sort_order, seo_title, seo_description
)
values
  ((select id from cat where slug = 'ramen'), 'Chicken Ramen', 'رامن بالدجاج', '鶏ラーメン', 'chicken-ramen',
   'Slow-simmered chicken broth, fresh noodles, marinated chicken, soft egg and spring onion.',
   180.00, true, true, false, false, false, false,
   20, 620, array['chicken broth','ramen noodles','chicken','egg','spring onion'], array['egg','gluten','soy'],
   'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=1200&q=75',
   'A bowl of chicken ramen with noodles, marinated chicken and a soft egg',
   true, 1, 'Chicken Ramen in Alexandria | Panda Wok', 'Slow-simmered chicken broth, fresh noodles and marinated chicken. Order Chicken Ramen from Panda Wok in Alexandria.'),

  ((select id from cat where slug = 'ramen'), 'Spicy Miso Ramen', 'رامن ميسو حار', '味噌ラーメン', 'spicy-miso-ramen',
   'Miso broth with chilli oil, minced pork, corn and spring onion. Genuinely spicy.',
   195.00, true, false, true, false, false, false,
   20, 700, array['miso broth','ramen noodles','pork','corn','chilli oil'], array['gluten','soy','pork'],
   'https://images.unsplash.com/photo-1552611052-33e04de081de?w=1200&q=75',
   'A bowl of spicy miso ramen with chilli oil and corn',
   false, 2, 'Spicy Miso Ramen in Alexandria | Panda Wok', 'Miso broth with chilli oil, minced pork and corn. A genuinely spicy ramen from Panda Wok.'),

  ((select id from cat where slug = 'sushi'), 'Salmon Nigiri (4 pcs)', 'نيجيري سلمون (٤ قطع)', 'サーモン握り', 'salmon-nigiri',
   'Four pieces of seasoned rice topped with sliced salmon.',
   170.00, true, true, false, false, false, false,
   10, 300, array['sushi rice','salmon','rice vinegar'], array['fish'],
   'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=1200&q=75',
   'Four pieces of salmon nigiri arranged on a plate',
   true, 1, 'Salmon Nigiri in Alexandria | Panda Wok', 'Four pieces of seasoned rice topped with sliced salmon. Fresh sushi from Panda Wok in Alexandria.'),

  ((select id from cat where slug = 'sushi'), 'Panda Roll', 'باندا رول', 'パンダロール', 'panda-roll',
   'Eight-piece roll with salmon, avocado, cucumber and toasted sesame.',
   215.00, true, true, false, false, false, true,
   15, 480, array['sushi rice','salmon','avocado','cucumber','sesame'], array['fish','sesame'],
   'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=1200&q=75',
   'An eight piece sushi roll with salmon and avocado',
   true, 2, 'Panda Roll in Alexandria | Panda Wok', 'Our signature eight-piece roll with salmon, avocado and toasted sesame. Order from Panda Wok.'),

  ((select id from cat where slug = 'sushi'), 'Cucumber Avocado Roll', 'رول خيار وأفوكادو', 'アボカドロール', 'cucumber-avocado-roll',
   'Eight-piece vegetarian roll with cucumber, avocado and sesame.',
   135.00, true, false, false, true, true, true,
   12, 360, array['sushi rice','cucumber','avocado','sesame'], array['sesame'],
   'https://images.unsplash.com/photo-1541696490-8744a5dc0228?w=1200&q=75',
   'A vegetarian sushi roll with cucumber and avocado',
   false, 3, 'Cucumber Avocado Roll | Panda Wok', 'A vegetarian eight-piece roll with cucumber, avocado and sesame from Panda Wok in Alexandria.'),

  ((select id from cat where slug = 'wok'), 'Beef Chow Fun', 'تشاو فان باللحم', '牛肉炒粉', 'beef-chow-fun',
   'Wide rice noodles tossed with beef, beansprouts and dark soy over high heat.',
   210.00, true, true, false, false, false, false,
   18, 780, array['rice noodles','beef','beansprouts','dark soy'], array['soy','gluten'],
   'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=1200&q=75',
   'Wide rice noodles with beef and beansprouts in a wok',
   true, 1, 'Beef Chow Fun in Alexandria | Panda Wok', 'Wide rice noodles with beef and beansprouts, cooked over high heat. Order from Panda Wok.'),

  ((select id from cat where slug = 'wok'), 'Chicken Fried Rice', 'أرز مقلي بالدجاج', '鶏炒飯', 'chicken-fried-rice',
   'Wok-tossed rice with chicken, egg, peas and spring onion.',
   155.00, true, false, false, false, false, false,
   15, 690, array['rice','chicken','egg','peas','spring onion'], array['egg','soy'],
   'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=1200&q=75',
   'A plate of chicken fried rice with peas and spring onion',
   false, 2, 'Chicken Fried Rice in Alexandria | Panda Wok', 'Wok-tossed rice with chicken, egg and peas. A reliable favourite from Panda Wok.'),

  ((select id from cat where slug = 'wok'), 'Vegetable Pad Thai', 'باد تاي بالخضار', '野菜パッタイ', 'vegetable-pad-thai',
   'Rice noodles with tamarind, peanuts, beansprouts and lime.',
   150.00, true, false, false, true, false, true,
   16, 610, array['rice noodles','tamarind','peanuts','beansprouts','lime'], array['peanut'],
   'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?w=1200&q=75',
   'Rice noodles with peanuts, beansprouts and lime',
   true, 3, 'Vegetable Pad Thai | Panda Wok', 'Rice noodles with tamarind, peanuts and lime. Vegetarian pad thai from Panda Wok in Alexandria.'),

  ((select id from cat where slug = 'appetizers'), 'Crispy Spring Rolls', 'سبرينج رولز مقرمشة', '春巻き', 'crispy-spring-rolls',
   'Four vegetable spring rolls with a sweet chilli dip.',
   95.00, true, false, false, true, false, false,
   10, 320, array['pastry','cabbage','carrot','glass noodles'], array['gluten'],
   'https://images.unsplash.com/photo-1553621042-f6e147245754?w=1200&q=75',
   'Four crispy spring rolls with a dipping sauce',
   false, 1, 'Crispy Spring Rolls | Panda Wok', 'Four vegetable spring rolls with sweet chilli dip, from Panda Wok in Alexandria.'),

  ((select id from cat where slug = 'appetizers'), 'Chicken Gyoza (5 pcs)', 'جويزا بالدجاج (٥ قطع)', '鶏餃子', 'chicken-gyoza',
   'Five pan-seared dumplings with a soy and vinegar dip.',
   120.00, true, true, false, false, false, false,
   12, 380, array['gyoza wrapper','chicken','cabbage','ginger'], array['gluten','soy'],
   'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=1200&q=75',
   'Five pan-seared chicken gyoza with dipping sauce',
   false, 2, 'Chicken Gyoza | Panda Wok', 'Five pan-seared chicken dumplings with a soy and vinegar dip. Starter from Panda Wok.'),

  ((select id from cat where slug = 'appetizers'), 'Seaweed Salad', 'سلطة أعشاب بحرية', '海藻サラダ', 'seaweed-salad',
   'Chilled seaweed with sesame dressing and cucumber.',
   85.00, true, false, false, true, false, true,
   6, 140, array['seaweed','sesame','cucumber','rice vinegar'], array['sesame'],
   'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=1200&q=75',
   'A chilled seaweed salad with sesame dressing',
   false, 3, 'Seaweed Salad | Panda Wok', 'Chilled seaweed with sesame dressing and cucumber. A light starter from Panda Wok.'),

  ((select id from cat where slug = 'drinks'), 'Iced Green Tea', 'شاي أخضر مثلج', '冷茶', 'iced-green-tea',
   'Cold green tea, lightly sweetened, served over ice.',
   45.00, true, false, false, true, true, false,
   3, 60, array['green tea','ice'], array[],
   'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=1200&q=75',
   'A glass of iced green tea',
   false, 1, 'Iced Green Tea | Panda Wok', 'Cold lightly sweetened green tea served over ice, from Panda Wok in Alexandria.')
on conflict (slug) do nothing;

-- Modifier groups for the dishes that genuinely need a choice.
insert into modifier_groups (menu_item_id, name_en, name_ar, min_select, max_select, is_required, sort_order)
select mi.id, g.name_en, g.name_ar, g.min_select, g.max_select, g.is_required, g.sort_order
from menu_items mi
join (values
  ('chicken-ramen', 'Add an extra', 'إضافة', 0, 2, false, 1),
  ('spicy-miso-ramen', 'Add an extra', 'إضافة', 0, 2, false, 1),
  ('beef-chow-fun', 'Add an extra', 'إضافة', 0, 2, false, 1)
) as g(slug, name_en, name_ar, min_select, max_select, is_required, sort_order)
  on mi.slug = g.slug
where not exists (select 1 from modifier_groups mg where mg.menu_item_id = mi.id);

insert into modifier_options (group_id, name_en, name_ar, price_delta, sort_order)
select mg.id, o.name_en, o.name_ar, o.price_delta, o.sort_order
from modifier_groups mg
join menu_items mi on mi.id = mg.menu_item_id
join (values
  ('Extra soft egg', 'بيضة إضافية', 20.00, 1),
  ('Extra chilli oil', 'زيت حار إضافي', 10.00, 2),
  ('Extra noodles', 'نودلز إضافية', 25.00, 3)
) as o(name_en, name_ar, price_delta, sort_order) on true
where mi.slug in ('chicken-ramen', 'spicy-miso-ramen', 'beef-chow-fun')
  and not exists (select 1 from modifier_options mo where mo.group_id = mg.id);

insert into stock_items (name_en, name_ar, unit, quantity, min_threshold, status, notes)
values
  ('Chicken', 'دجاج', 'kg', 12.000, 4.000, 'ok', null),
  ('Beef', 'لحم', 'kg', 8.000, 3.000, 'ok', null),
  ('Salmon', 'سلمون', 'kg', 5.000, 2.000, 'ok', null),
  ('Rice', 'أرز', 'kg', 25.000, 8.000, 'ok', null),
  ('Ramen noodles', 'نودلز رامن', 'kg', 9.000, 3.000, 'ok', null),
  ('Rice noodles', 'نودلز أرز', 'kg', 7.000, 3.000, 'ok', null),
  ('Soy sauce', 'صويا صوص', 'L', 6.000, 2.000, 'ok', null),
  ('Miso paste', 'ميسو', 'kg', 3.000, 1.000, 'ok', null),
  ('Avocado', 'أفوكادو', 'pcs', 30.000, 10.000, 'ok', null),
  ('Cucumber', 'خيار', 'kg', 4.000, 1.500, 'ok', null),
  ('Spring onion', 'بصل أخضر', 'kg', 2.000, 1.000, 'ok', null),
  ('Cabbage', 'كرنب', 'kg', 5.000, 2.000, 'ok', null),
  ('Eggs', 'بيض', 'pcs', 60.000, 24.000, 'ok', null),
  ('Cooking oil', 'زيت', 'L', 15.000, 5.000, 'ok', null),
  ('Packaging', 'عبوات وتغليف', 'pcs', 200.000, 80.000, 'ok', null)
where not exists (select 1 from stock_items);

-- Wire stock to the dishes that actually consume it.
insert into menu_item_stock (menu_item_id, stock_item_id, quantity_per_unit)
select mi.id, si.id, v.qty
from (values
  ('chicken-ramen', 'Chicken', 0.180),
  ('chicken-ramen', 'Ramen noodles', 0.150),
  ('chicken-ramen', 'Eggs', 1.000),
  ('chicken-ramen', 'Spring onion', 0.020),
  ('spicy-miso-ramen', 'Miso paste', 0.060),
  ('spicy-miso-ramen', 'Ramen noodles', 0.150),
  ('spicy-miso-ramen', 'Spring onion', 0.020),
  ('salmon-nigiri', 'Salmon', 0.090),
  ('salmon-nigiri', 'Rice', 0.100),
  ('panda-roll', 'Salmon', 0.110),
  ('panda-roll', 'Rice', 0.150),
  ('panda-roll', 'Avocado', 1.000),
  ('panda-roll', 'Cucumber', 0.030),
  ('cucumber-avocado-roll', 'Rice', 0.150),
  ('cucumber-avocado-roll', 'Avocado', 1.000),
  ('cucumber-avocado-roll', 'Cucumber', 0.050),
  ('beef-chow-fun', 'Beef', 0.200),
  ('beef-chow-fun', 'Rice noodles', 0.200),
  ('beef-chow-fun', 'Soy sauce', 0.030),
  ('chicken-fried-rice', 'Chicken', 0.150),
  ('chicken-fried-rice', 'Rice', 0.250),
  ('chicken-fried-rice', 'Eggs', 1.000),
  ('vegetable-pad-thai', 'Rice noodles', 0.200),
  ('crispy-spring-rolls', 'Cabbage', 0.120),
  ('chicken-gyoza', 'Chicken', 0.150),
  ('chicken-gyoza', 'Cabbage', 0.080)
) as v(menu_slug, stock_name, qty)
join menu_items mi on mi.slug = v.menu_slug
join stock_items si on si.name_en = v.stock_name
where not exists (
  select 1 from menu_item_stock mis
   where mis.menu_item_id = mi.id and mis.stock_item_id = si.id
);

insert into upsell_rules (name, trigger_kind, trigger_category_id, suggest_kind, suggest_category_id, headline_en, headline_ar, priority)
select
  'Ramen pairs with a cold drink',
  'category',
  (select id from categories where slug = 'ramen'),
  'category',
  (select id from categories where slug = 'drinks'),
  'Ramen and iced green tea is the usual pairing.',
  'الرامن مع الشاي الأخضر المثلج هو الاختيار المعتاد.',
  10
where not exists (select 1 from upsell_rules where name = 'Ramen pairs with a cold drink');

insert into upsell_rules (name, trigger_kind, trigger_category_id, suggest_kind, suggest_category_id, headline_en, headline_ar, priority)
select
  'Sushi pairs with a starter',
  'category',
  (select id from categories where slug = 'sushi'),
  'category',
  (select id from categories where slug = 'appetizers'),
  'Sushi orders usually start with gyoza or spring rolls.',
  'طلبات السوشي عادة تبدأ بالجويزا أو السبرينج رولز.',
  8
where not exists (select 1 from upsell_rules where name = 'Sushi pairs with a starter');

insert into loyalty_rewards (name_en, name_ar, description_en, points_cost, kind, value, min_order_total, tier_required, is_enabled)
values
  ('EGP 50 off', 'خصم ٥٠ جنيه', 'Redeem 500 points for EGP 50 off an order of EGP 200 or more.', 500, 'discount_amount', 50.00, 200.00, 'bronze', true),
  ('Free Iced Green Tea', 'شاي أخضر مثلج مجانًا', 'Redeem 300 points for a free iced green tea with any order.', 300, 'free_item', 0.00, 100.00, 'bronze', true),
  ('EGP 150 off', 'خصم ١٥٠ جنيه', 'Redeem 1200 points for EGP 150 off an order of EGP 400 or more.', 1200, 'discount_amount', 150.00, 400.00, 'silver', true)
where not exists (select 1 from loyalty_rewards);

update loyalty_rewards
   set menu_item_id = (select id from menu_items where slug = 'iced-green-tea')
 where name_en = 'Free Iced Green Tea' and menu_item_id is null;

insert into settings (key, value, description, is_public) values
  ('brand.name', '"Panda Wok"'::jsonb, 'Public brand name shown across the app.', true),
  ('brand.city', '"Alexandria"'::jsonb, 'City shown in public metadata and local SEO.', true),
  ('brand.country', '"Egypt"'::jsonb, 'Country shown in public metadata and local SEO.', true),
  ('brand.cuisine', '"Asian cuisine"'::jsonb, 'Cuisine descriptor used in metadata.', true),
  ('brand.tagline', '"Asian kitchen, crafted to order"'::jsonb, 'Short public tagline.', true),
  ('support.phone', 'null'::jsonb, 'Public support phone number. Fill in from Settings; blank is rendered as "not published yet".', true),
  ('support.whatsapp', 'null'::jsonb, 'Public WhatsApp number. Blank is rendered as "not published yet".', true),
  ('support.email', 'null'::jsonb, 'Public contact email. Blank is rendered as "not published yet".', true),
  ('support.social', '{}'::jsonb, 'Public social profile URLs keyed by platform.', true),
  ('support.opening_hours', '{}'::jsonb, 'Public opening hours. Empty means no structured hours are published.', true),
  ('delivery.fee', '30'::jsonb, 'Flat delivery fee in EGP.', true),
  ('delivery.free_over', '250'::jsonb, 'Basket subtotal above which delivery is free.', true),
  ('delivery.eta_minutes', '35'::jsonb, 'Base ETA in minutes before per-item prep time is added.', true),
  ('tax.rate', '0.14'::jsonb, 'VAT rate applied to the discounted subtotal plus delivery.', false),
  ('ordering.min_order_total', '80'::jsonb, 'Minimum basket subtotal to place an order.', true),
  ('ordering.max_qty_per_item', '20'::jsonb, 'Maximum quantity of a single item per order.', false),
  ('ordering.accepting_orders', 'true'::jsonb, 'Master switch for accepting new orders.', true),
  ('loyalty.points_per_currency', '1'::jsonb, 'Points earned per 1 EGP of order total. Editable, never hard-coded.', false),
  ('loyalty.multiplier', '1'::jsonb, 'Global points multiplier for promotions.', false),
  ('loyalty.point_value', '1'::jsonb, 'EGP value of one point at redemption.', false),
  ('loyalty.tier.silver', '500'::jsonb, 'Lifetime points required for silver tier.', false),
  ('loyalty.tier.gold', '2000'::jsonb, 'Lifetime points required for gold tier.', false),
  ('loyalty.tier.platinum', '5000'::jsonb, 'Lifetime points required for platinum tier.', false),
  ('loyalty.expiry_months', '12'::jsonb, 'Months before earned points expire.', false),
  ('ai.assistant.enabled', 'true'::jsonb, 'Whether the public Panda assistant is offered.', true),
  ('ai.assistant.disclosure', '"Answers are generated by an AI assistant from live Panda Wok data."'::jsonb, 'Disclosure shown with assistant output.', true),
  ('ai.crm_insights.enabled', 'true'::jsonb, 'Whether admin AI CRM insights are generated.', false),
  ('privacy.retention_days', '365'::jsonb, 'Days to retain activity and analytics rows. Enforced by a maintenance task.', false)
on conflict (key) do nothing;

insert into feature_flags (key, label, description, module, is_enabled, sort_order) values
  ('menu', 'Menu', 'Public menu browsing.', 'customer', true, 10),
  ('ordering', 'Ordering', 'Cart, checkout and order placement.', 'customer', true, 20),
  ('tracking', 'Tracking', 'Live order tracking for customers.', 'customer', true, 30),
  ('accounts', 'Accounts', 'Customer sign-up and profile.', 'customer', true, 40),
  ('feedback', 'Feedback', 'Customer feedback and ratings.', 'customer', true, 50),
  ('loyalty', 'Loyalty', 'Points, tiers and rewards.', 'customer', true, 60),
  ('chat', 'Chat', 'Customer to kitchen messaging.', 'customer', true, 70),
  ('assistant', 'AI Assistant', 'Public Panda assistant.', 'customer', true, 80),
  ('broadcast', 'Broadcast', 'Targeted announcements to customers.', 'admin', true, 90),
  ('upsell', 'Upselling', 'Contextual suggestions in the cart.', 'customer', true, 100),
  ('reservations', 'Reservations', 'Table reservations. Not part of the cloud kitchen flow.', 'customer', false, 110)
on conflict (key) do nothing;

insert into ai_prompts (key, name, system_instruction, temperature, max_tokens) values
  ('panda_assistant',
   'Panda Wok customer assistant',
   'You are the Panda Wok assistant. Answer only from the DATA block supplied with each question: it is a live snapshot of the Panda Wok menu, prices, availability, dietary flags, loyalty programme and contact details. If the DATA block does not contain the answer, say you do not have that information and suggest the customer contact the kitchen. Never invent or estimate a dish, price, discount, ingredient, allergy claim, delivery time, address or promotion. Never claim an item is safe for an allergy: report only the recorded allergen list and tell the customer to confirm with the kitchen. Keep replies under 120 words, warm and concise. Prices are in EGP. When the customer is deciding, recommend at most two dishes that exist in the DATA block.',
   0.2, 500),
  ('crm_insights',
   'Admin CRM insight analyst',
   'You are analysing real aggregate data from the Panda Wok ordering system. The DATA block is the complete and only source of truth. Write short, specific observations that a kitchen manager could act on this week. Every observation must cite the concrete numbers it came from. Do not invent metrics, benchmarks, percentages or comparisons that are not in the DATA block. If the data is too thin to support a conclusion, say so explicitly instead of guessing. Distinguish clearly between what the data shows and what you suggest doing about it. Never claim a cause with certainty: describe correlations as patterns, and state confidence as low, medium or high with a one-line reason.',
   0.25, 900)
on conflict (key) do nothing;

insert into ai_providers (name, kind, base_url, model, secret_ref, is_enabled, is_fallback, priority, max_requests_per_minute) values
  ('deterministic', 'builtin', null, 'menu-grounded-rules', null, true, true, 900, 120)
on conflict (name) do nothing;
