-- Panda Wok :: core domain
-- Foundations: enums, profiles, RBAC, business settings, feature flags, audit.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- enums

create type staff_role as enum (
  'owner', 'admin', 'manager', 'kitchen', 'support', 'marketing'
);

create type order_status as enum (
  'new', 'accepted', 'in_progress', 'prepared', 'out_for_delivery',
  'finished', 'canceled', 'rejected', 'failed', 'refunded'
);

create type fulfillment_type as enum ('delivery', 'pickup');

create type payment_method as enum ('cash_on_delivery', 'card_on_delivery', 'online');

create type payment_status as enum ('unpaid', 'authorized', 'paid', 'refunded', 'failed');

create type stock_status as enum ('ok', 'low', 'out');

create type stock_direction as enum ('in', 'out', 'adjust');

create type loyalty_tier as enum ('bronze', 'silver', 'gold', 'platinum');

create type loyalty_txn_type as enum ('earn', 'redeem', 'expire', 'adjust', 'bonus');

create type feedback_category as enum ('food_quality', 'delivery', 'service', 'overall', 'other');

create type feedback_status as enum ('new', 'reviewed', 'responded', 'resolved', 'archived');

create type conversation_status as enum ('open', 'pending', 'closed');

create type broadcast_status as enum ('draft', 'queued', 'sending', 'sent', 'failed', 'canceled');

create type broadcast_channel as enum ('in_app', 'email', 'sms', 'push');

create type export_format as enum ('csv', 'json');

create type export_status as enum ('queued', 'running', 'ready', 'failed', 'expired');

create type backup_kind as enum ('database', 'configuration', 'menu', 'media_refs', 'snapshot');

create type backup_status as enum ('queued', 'running', 'ready', 'failed');

-- ---------------------------------------------------------------- profiles

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  email text,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  marketing_opt_in boolean not null default false,
  notifications_opt_in boolean not null default true,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index profiles_phone_idx on profiles (phone);
create index profiles_created_at_idx on profiles (created_at desc);

create table staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role staff_role not null default 'kitchen',
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- settings & flags

create table settings (
  key text primary key,
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table feature_flags (
  key text primary key,
  label text not null,
  description text,
  module text not null,
  is_enabled boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit

create table audit_logs (
  id bigserial primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role staff_role,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity, entity_id);
create index audit_logs_created_at_idx on audit_logs (created_at desc);

-- ---------------------------------------------------------------- helpers

create or replace function public.current_staff_role()
returns staff_role
language sql
stable
security definer
set search_path = public
as $$
  select s.role from staff s
  where s.user_id = auth.uid() and s.is_active
  limit 1;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff s where s.user_id = auth.uid() and s.is_active
  );
$$;

-- Role hierarchy: owner > admin > manager > (kitchen | support | marketing).
create or replace function public.has_role(required staff_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with r as (select public.current_staff_role() as role)
  select case
    when (select role from r) is null then false
    when (select role from r) = 'owner' then true
    when required = 'owner' then false
    when (select role from r) = 'admin' then true
    when required = 'admin' then false
    when (select role from r) = 'manager' then true
    when required = 'manager' then false
    else (select role from r) = required
  end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('manager');
$$;

-- ---------------------------------------------------------------- triggers

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_touch before update on profiles
  for each row execute function public.touch_updated_at();

create trigger settings_touch before update on settings
  for each row execute function public.touch_updated_at();

create trigger feature_flags_touch before update on feature_flags
  for each row execute function public.touch_updated_at();
