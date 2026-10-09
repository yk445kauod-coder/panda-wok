-- Customer notes and tags: the missing CRM primitives.
--
-- The CRM could show what a customer *did* (orders, spend, feedback, activity)
-- but a staff member had nowhere to record what they *know* — "prefers no
-- onions", "call before delivery", "VIP from the office block". That is the
-- everyday work of a CRM and it had no home, so it lived in staff memory or a
-- WhatsApp thread.
--
-- Both tables are additive and safe: no existing row is read or written, and
-- re-running this file is a no-op.
--
-- Capability mapping: notes and tags are the *staff* surface of a customer
-- record, so both are gated on `crm.view` for reads. Writes additionally require
-- a non-kitchen role — `crm.view` is held by support and marketing too, and
-- annotating a customer is support work, not a kitchen task. RLS mirrors this
-- with `can_view_crm()` / `can_edit_crm()` rather than the broad `authenticated`
-- so the database stays the backstop.

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  -- Pinned notes float to the top of the customer 360.
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_notes_customer_idx
  on public.customer_notes (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Tags: a controlled vocabulary plus the join to customers.
-- ---------------------------------------------------------------------------
create table if not exists public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  -- Lower-cased machine key; the label is what staff read.
  key text not null check (key ~ '^[a-z0-9][a-z0-9_-]{1,30}$'),
  label_en text not null,
  label_ar text not null,
  -- Cosmetic only: a token name from the design system, never raw CSS.
  tone text not null default 'neutral'
    check (tone in ('neutral', 'success', 'warning', 'danger', 'info', 'indigo')),
  created_at timestamptz not null default now(),
  constraint customer_tags_key_key unique (key)
);

create table if not exists public.customer_tag_links (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  tag_id uuid not null references public.customer_tags(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);

create index if not exists customer_tag_links_tag_idx
  on public.customer_tag_links (tag_id);

-- The owner's own vocabulary. Labels are the owner's wording, in both languages;
-- nothing here is inferred from customer behaviour.
insert into public.customer_tags (key, label_en, label_ar, tone) values
  ('vip',          'VIP',            'عميل مميز',      'success'),
  ('regular',      'Regular',        'عميل دائم',      'info'),
  ('office',       'Office order',   'طلب مكتب',       'indigo'),
  ('no_onion',     'No onion',       'بدون بصل',       'warning'),
  ('spicy',        'Loves spicy',    'بيحب الحار',     'danger'),
  ('cod',          'Cash on delivery','دفع عند الاستلام','neutral'),
  ('allergy',      'Allergy — check','حساسية — راجع', 'danger')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists customer_notes_touch on public.customer_notes;
create trigger customer_notes_touch
  before update on public.customer_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. `can_view_crm()` / `can_edit_crm()` are defined here because the CRM
-- capability is expressed in TypeScript (`crm.view`) but RLS cannot read it.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_crm()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and s.is_active
      and s.role in ('owner', 'admin', 'manager', 'support', 'marketing')
  );
$$;

create or replace function public.can_edit_crm()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and s.is_active
      and s.role in ('owner', 'admin', 'manager', 'support', 'marketing')
  );
$$;

revoke execute on function public.can_view_crm() from public, anon;
revoke execute on function public.can_edit_crm() from public, anon;
grant execute on function public.can_view_crm() to authenticated;
grant execute on function public.can_edit_crm() to authenticated;

alter table public.customer_notes enable row level security;
alter table public.customer_tags enable row level security;
alter table public.customer_tag_links enable row level security;

drop policy if exists customer_notes_staff_read on public.customer_notes;
create policy customer_notes_staff_read on public.customer_notes
  for select to authenticated using (public.can_view_crm());

drop policy if exists customer_notes_staff_write on public.customer_notes;
create policy customer_notes_staff_write on public.customer_notes
  for all to authenticated
  using (public.can_edit_crm())
  with check (public.can_edit_crm());

drop policy if exists customer_tags_staff_read on public.customer_tags;
create policy customer_tags_staff_read on public.customer_tags
  for select to authenticated using (public.can_view_crm());

drop policy if exists customer_tags_staff_write on public.customer_tags;
create policy customer_tags_staff_write on public.customer_tags
  for all to authenticated
  using (public.can_edit_crm())
  with check (public.can_edit_crm());

drop policy if exists customer_tag_links_staff_read on public.customer_tag_links;
create policy customer_tag_links_staff_read on public.customer_tag_links
  for select to authenticated using (public.can_view_crm());

drop policy if exists customer_tag_links_staff_write on public.customer_tag_links;
create policy customer_tag_links_staff_write on public.customer_tag_links
  for all to authenticated
  using (public.can_edit_crm())
  with check (public.can_edit_crm());
