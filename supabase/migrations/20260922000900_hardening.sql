-- Panda Wok :: production hardening (applied live as 009_hardening_availability_clawback_profiles)
begin;

-- 1) Availability mode: three-state enum rises ("auto", "forced_on", "forced_off")
--    replaces the legacy boolean availability_override that existed in the live DB.
alter table public.menu_items
  add column if not exists availability_mode text not null default 'auto'
  check (availability_mode in ('auto', 'forced_on', 'forced_off'));

-- Backfill: false → auto; true → forced_on (admin-owned rows stay untouched by automation).
-- availability_override only ever existed in the live database, so on a fresh
-- replay the column is absent and this backfill must be skipped rather than fail.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'menu_items'
      and column_name = 'availability_override'
  ) then
    update public.menu_items
      set availability_mode = case when availability_override then 'forced_on' else 'auto' end
      where availability_mode = 'auto';
  end if;
end $$;

alter table public.menu_items drop column if exists availability_override;

-- 2) recompute_stock_status respects availability_mode (ignores forced states).
create or replace function public.recompute_stock_status(item_id uuid)

returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric;  v_min numeric;  v_status stock_status;
begin
  select quantity, min_threshold into v_qty, v_min from stock_items where id = item_id;
  if v_qty is null then return;  end if;

  v_status := case
    when v_qty <= 0 then 'out'::stock_status
    when v_qty <= v_min then 'low'::stock_status
    else 'ok'::stock_status
  end;
  update stock_items set status = v_status, last_updated_at = now()
    where id = item_id AND status is distinct from v_status;

  -- auto-disable only rows in auto mode (forced items are admin-owned and untouched).
  update menu_items mi set is_available = false
    where mi.id in (select menu_item_id from menu_item_stock where stock_item_id = item_id)
      and mi.availability_mode = 'auto'
      and exists (
        select 1 from menu_item_stock mis
        join stock_items si on si.id = mis.stock_item_id
        where mis.menu_item_id = mi.id AND si.auto_link_availability AND si.quantity <= 0
      );

  -- auto-re-enable only rows in auto mode that were turned off by stock.
  -- forced_off stays disabled; forced_on stays enabled regardless of stock.$
  update menu_items mi set is_available = true
    where mi.id in (select menu_item_id from menu_item_stock where stock_item_id = item_id)
      and mi.availability_mode = 'auto' AND mi.is_available = false
      and not exists (
        select 1 from menu_item_stock mis
        join stock_items si on si.id = mis.stock_item_id
        where mis.menu_item_id = mi.id AND si.auto_link_availability AND si.quantity <= 0
      );
end;
$$;

-- 3) Loyalty clawback on terminal-failure..
--    enum value must exist BEFORE the trigger function compiles the insert.
alter type public.loyalty_txn_type add value if not exists 'clawback';

create or replace function public.clawback_loyalty_on_failure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clawed int;
begin
  if new.status in ('canceled', 'rejected', 'failed', 'refunded')
     and old.status is distinct from new.status then
    if coalesce(new.points_redeemed, 0) > 0 then
      -- Idempotent: only claw back once per order
      select count(*) into v_clawed from loyalty_transactions
        where order_id = new.id and type = 'clawback';
      if v_clawed = 0 then
        insert into loyalty_transactions (user_id, order_id, type, points, reason, created_by)
        values (new.user_id, new.id, 'clawback', new.points_redeemed,
                'Refund of redeemed points for ' || new.status, new.user_id);

        update loyalty_accounts
           set points_balance = points_balance + new.points_redeemed
         where user_id = new.user_id;

        insert into activity_logs (user_id, event, entity, entity_id, metadata)
        values (new.user_id, 'LOYALTY_CLAWBACK', 'orders', new.id::text,
                jsonb_build_object('points', new.points_redeemed));
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_clawback_loyalty
  after update of status on public.orders
  for each row execute function public.clawback_loyalty_on_failure();

-- 4) Profiles: citext email + normalized phone unique..
create extension if not exists citext with schema extensions;

alter table public.profiles
  alter column email type extensions.citext using email::extensions.citext;

-- Normalize existing phones to canonical E.164 (0 rows now,but keep idempotent for reuse)。.
update public.profiles
  set phone = case
    when phone is null then null
    when phone ~ '^\+[1-9][0-9]{5,14}$' then phone
    when phone ~ '^00[1-9][0-9]{5,14}$' then '+' || substr(phone, 3)
    when phone ~ '^20[0-9]{9}$' then '+' || phone
    when phone ~ '^0[0-9]{9}$' then '+20' || substr(phone, 2)
    when phone ~ '^[1-9][0-9]{7,9}$' then '+20' || phone
    else null
  end
  where phone is not null;

-- Rebuild unique indexes (drops old plain-text ones first).
drop index if exists public.profiles_email_key;
create unique index profiles_email_key on public.profiles (email) where email is not null;

drop index if exists public.profiles_phone_key;
 create unique index profiles_phone_key on public.profiles (phone) where phone is not null;

commit;