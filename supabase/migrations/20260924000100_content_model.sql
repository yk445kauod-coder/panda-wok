-- Panda Wok :: content model — admin-editable page copy, FAQs, delivery zones,
-- announcements and per-page SEO.
--
-- Until now the long-form marketing copy lived in `about/page.tsx` and the
-- per-page meta lived in code, so staff could not change either without a
-- deploy. These five tables move that content behind the CMS. Every table is
-- additive: the app keeps a dictionary/code fallback, so an empty table renders
-- exactly what the site renders today. Nothing here invents content.
--
-- Tenancy mirrors the rest of the schema: restaurant_id defaults to
-- current_restaurant_id() (single-tenant today) and every read policy is scoped
-- to that tenant, so the columns are load-bearing rather than decorative.

begin;

-- ---------------------------------------------------------------- page copy

create table if not exists public.page_content (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_restaurant_id()
    references public.restaurants (id) on delete cascade,
  page_key text not null,
  section_key text not null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  heading text,
  body text,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, page_key, section_key, locale)
);

create index if not exists page_content_lookup_idx
  on public.page_content (page_key, is_published, sort_order);
create index if not exists page_content_restaurant_idx
  on public.page_content (restaurant_id);

-- ---------------------------------------------------------------- FAQs

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_restaurant_id()
    references public.restaurants (id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faqs_lookup_idx
  on public.faqs (locale, is_published, sort_order);
create index if not exists faqs_restaurant_idx
  on public.faqs (restaurant_id);

-- ---------------------------------------------------------------- delivery zones

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_restaurant_id()
    references public.restaurants (id) on delete cascade,
  name_en text not null,
  name_ar text,
  areas text[] not null default '{}',
  fee numeric(10, 2) not null default 0 check (fee >= 0),
  free_over numeric(10, 2) check (free_over is null or free_over >= 0),
  eta_minutes int check (eta_minutes is null or eta_minutes > 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_zones_restaurant_idx
  on public.delivery_zones (restaurant_id, is_active, sort_order);

-- ---------------------------------------------------------------- announcements

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_restaurant_id()
    references public.restaurants (id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  message text not null,
  href text,
  tone text not null default 'info' check (tone in ('info', 'success', 'warning', 'plum')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_restaurant_idx
  on public.announcements (restaurant_id, is_active, sort_order);

-- ---------------------------------------------------------------- per-page SEO

create table if not exists public.page_seo (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_restaurant_id()
    references public.restaurants (id) on delete cascade,
  page_key text not null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  title text,
  description text,
  og_image_url text,
  noindex boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, page_key, locale)
);

create index if not exists page_seo_lookup_idx
  on public.page_seo (page_key, locale);
create index if not exists page_seo_restaurant_idx
  on public.page_seo (restaurant_id);

-- ---------------------------------------------------------------- timestamps

drop trigger if exists page_content_touch on public.page_content;
create trigger page_content_touch before update on public.page_content
  for each row execute function public.touch_updated_at();

drop trigger if exists faqs_touch on public.faqs;
create trigger faqs_touch before update on public.faqs
  for each row execute function public.touch_updated_at();

drop trigger if exists delivery_zones_touch on public.delivery_zones;
create trigger delivery_zones_touch before update on public.delivery_zones
  for each row execute function public.touch_updated_at();

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
  for each row execute function public.touch_updated_at();

drop trigger if exists page_seo_touch on public.page_seo;
create trigger page_seo_touch before update on public.page_seo
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS

alter table public.page_content enable row level security;
alter table public.faqs enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.announcements enable row level security;
alter table public.page_seo enable row level security;

-- Public read: only published / active rows, scoped to the tenant, so the
-- anonymous client can render the site without ever seeing drafts.
create policy page_content_public_read on public.page_content
  for select to anon, authenticated
  using (is_published and restaurant_id = public.current_restaurant_id());
create policy page_content_staff_write on public.page_content
  for all to authenticated
  using (public.can_manage_marketing()) with check (public.can_manage_marketing());

create policy faqs_public_read on public.faqs
  for select to anon, authenticated
  using (is_published and restaurant_id = public.current_restaurant_id());
create policy faqs_staff_write on public.faqs
  for all to authenticated
  using (public.can_manage_marketing()) with check (public.can_manage_marketing());

create policy page_seo_public_read on public.page_seo
  for select to anon, authenticated
  using (restaurant_id = public.current_restaurant_id());
create policy page_seo_staff_write on public.page_seo
  for all to authenticated
  using (public.can_manage_marketing()) with check (public.can_manage_marketing());

create policy announcements_public_read on public.announcements
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and restaurant_id = public.current_restaurant_id()
  );
create policy announcements_staff_write on public.announcements
  for all to authenticated
  using (public.can_manage_marketing()) with check (public.can_manage_marketing());

create policy delivery_zones_public_read on public.delivery_zones
  for select to anon, authenticated
  using (is_active and restaurant_id = public.current_restaurant_id());
create policy delivery_zones_staff_write on public.delivery_zones
  for all to authenticated
  using (public.has_role('manager')) with check (public.has_role('manager'));

-- ---------------------------------------------------------------- seed

-- Move the about-page copy that used to be hardcoded in `about/page.tsx` into
-- the table, so the rendered page is byte-for-byte what it is today and staff
-- can now edit it. Arabic rows are faithful translations of the same sentences.
insert into public.page_content (page_key, section_key, locale, heading, body, sort_order)
values
  ('about', 'story', 'en',
   'A cloud kitchen, not a dining room',
   'We cook in a dedicated kitchen and send everything straight to you. That means no tables, no queues and no waiting room — just food made when you order it, and a smaller operation that can pay attention to detail.',
   10),
  ('about', 'story', 'ar',
   'مطبخ سحابي، لا قاعة طعام',
   'نطبخ في مطبخ مخصّص ونرسل كل شيء إليك مباشرة. هذا يعني لا طاولات ولا صفوف ولا قاعة انتظار — فقط طعام يُعدّ عند طلبك، وعملية أصغر تستطيع الاهتمام بالتفاصيل.',
   10),
  ('about', 'how_we_cook', 'en',
   'How we cook',
   'Wok dishes are cooked over high heat to order, broth is made ahead and held hot, and sushi is rolled as the order comes in. Nothing sits under a lamp waiting to be chosen. Because everything is made to order, our prep times are honest rather than instant, and a busy night affects everyone equally.',
   20),
  ('about', 'how_we_cook', 'ar',
   'كيف نطبخ',
   'تُطبخ أطباق الووك على نار عالية عند الطلب، ويُعدّ المرق مسبقًا ويُحفظ ساخنًا، ويُلفّ السوشي عند وصول الطلب. لا شيء ينتظر تحت مصباح ليُختار. ولأن كل شيء يُعدّ عند الطلب، فأوقات التحضير لدينا صادقة وليست فورية، والليلة المزدحمة تؤثر على الجميع بالتساوي.',
   20),
  ('about', 'allergens', 'en',
   'Allergens and honest labelling',
   'Every dish page lists the allergens the kitchen has recorded, along with vegetarian, vegan and spicy markers. That information is what we know about our own preparation; it is not a guarantee, because suppliers and shared equipment can introduce traces. If you have a serious allergy, please speak to us directly before ordering.',
   30),
  ('about', 'allergens', 'ar',
   'مسببات الحساسية ووسم صادق',
   'تعرض صفحة كل طبق مسببات الحساسية التي سجّلها المطبخ، مع علامات النباتي والنباتي الصرف والحار. هذه المعلومات هي ما نعرفه عن تحضيرنا؛ وهي ليست ضمانًا، لأن الموردين والمعدات المشتركة قد تُدخل آثارًا. إذا كانت لديك حساسية شديدة، فيرجى التحدث إلينا مباشرة قبل الطلب.',
   30)
on conflict (restaurant_id, page_key, section_key, locale) do nothing;

commit;
