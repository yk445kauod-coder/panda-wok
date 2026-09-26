-- Panda Wok :: tenancy defaults + security hardening
--
-- 011 added restaurant_id as NOT NULL to the domain tables, but nothing fills
-- it on insert: handle_new_user() and place_order() never mention the column,
-- so every signup and every order fails with a not-null violation.
-- Restoring the default (the same resolver the app uses, and the rule the
-- backfill used) makes inserts work again while keeping the tenant explicit.
-- A not-null column with a default is still explicit: operators may override
-- it, and the FK continues to enforce a valid restaurant.
--
-- The same migration fixes the search_path / anon-execute warnings the Supabase
-- linter raises on the helper functions.

begin;

-- 1) Domain tables resolve their tenant automatically on insert.
alter table public.categories  alter column restaurant_id set default public.current_restaurant_id();
alter table public.menu_items  alter column restaurant_id set default public.current_restaurant_id();
alter table public.orders      alter column restaurant_id set default public.current_restaurant_id();
alter table public.profiles    alter column restaurant_id set default public.current_restaurant_id();

-- 2) Pin search_path on the helpers flagged as mutable so a caller cannot
--    shadow a name and change what these functions resolve.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.order_is_editable(s order_status)
returns boolean
language sql
immutable
set search_path = public
as $$
  select s in ('new', 'accepted', 'in_progress');
$$;

create or replace function public.next_order_number()
returns text
language plpgsql
set search_path = public
as $$
begin
  return 'PW-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('order_number_seq')::text, 4, '0');
end;
$$;

-- 3) rls_auto_enable is a dashboard helper, not part of the app surface.
--    It has no business being callable through the public API by anon.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

commit;
