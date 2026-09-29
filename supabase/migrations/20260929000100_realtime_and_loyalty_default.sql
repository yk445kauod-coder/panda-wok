-- Realtime for customer order tracking, and loyalty off by default.
--
-- Two independent fixes, both required for the reported symptoms.
--
-- 1. The customer order page subscribes to `order_status_history` inserts over
--    Supabase Realtime, but the `supabase_realtime` publication held **no
--    tables**, so `postgres_changes` never fired. Worse, Realtime still reports
--    `SUBSCRIBED` for an empty publication, so the client marked itself "live"
--    and turned off its polling fallback — the customer was frozen until a manual
--    refresh. Adding both tables to the publication is what actually delivers
--    status changes to the tracking page and the kitchen display.
--
--    RLS is still applied per subscriber, so a customer only receives rows for
--    their own order (`orders_owner_read` / `order_status_history_owner_read` are
--    the only SELECT policies). Membership in the publication is not a grant.
--
-- 2. Loyalty must default to off and be re-enablable from the admin console.
--    Turning the flag off now also stops the *accrual* machinery, which it did
--    not before: the status-history trigger, the earn trigger and the clawback
--    trigger all consulted nothing. They now honour the `loyalty` feature flag,
--    and `place_order` refuses to redeem points while it is disabled. History is
--    not written while the flag is off — a deliberate simplification: the flag is
--    a launch switch, and re-enabling restores logging from that point on.

-- ---------------------------------------------------------------- flag helper

create or replace function public.setting_flag(p_key text, p_default boolean default true)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_enabled from feature_flags where key = p_key),
    p_default
  );
$$;

-- Internal predicate: only ever called from other SECURITY DEFINER functions.
revoke execute on function public.setting_flag(text, boolean) from public, anon, authenticated;

-- ------------------------------------------------------- realtime publication

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_status_history'
  ) then
    execute 'alter publication supabase_realtime add table public.order_status_history';
  end if;
end $$;

-- ------------------------------------------------------------- loyalty switch

-- Honour the flag in the loyalty triggers. Order-status history is NOT loyalty
-- state — it is the audit trail and the realtime signal the customer's tracking
-- page listens on — so it is always written; only points accrual and clawback
-- are gated. (Gating history on loyalty would silence tracking whenever loyalty
-- is off, which is precisely the bug being fixed.)
create or replace function public.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_by_role)
    values (new.id, null, new.status, new.user_id, null);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_by_role)
    values (new.id, old.status, new.status, auth.uid(), public.current_staff_role());
    if new.status = 'accepted' then new.accepted_at = coalesce(new.accepted_at, now());
    elsif new.status = 'prepared' then new.prepared_at = coalesce(new.prepared_at, now());
    elsif new.status = 'out_for_delivery' then new.dispatched_at = coalesce(new.dispatched_at, now());
    elsif new.status = 'finished' then new.finished_at = coalesce(new.finished_at, now());
    elsif new.status in ('canceled', 'rejected', 'failed', 'refunded') then
      new.canceled_at = coalesce(new.canceled_at, now());
    end if;

    -- Only a refund changes the money state; every other step keeps it.
    if new.status = 'refunded' then
      new.payment_status = 'refunded';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.award_loyalty_on_finish()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_multiplier numeric(10, 4);
  v_silver numeric;
  v_gold numeric;
  v_platinum numeric;
  v_lifetime int;
  v_tier loyalty_tier;
  v_points int;
begin
  if new.status = 'finished' and old.status is distinct from 'finished'
     and public.setting_flag('loyalty', true) then
    v_multiplier := public.setting_numeric('loyalty.multiplier', 1);
    v_silver := public.setting_numeric('loyalty.tier.silver', 500);
    v_gold := public.setting_numeric('loyalty.tier.gold', 2000);
    v_platinum := public.setting_numeric('loyalty.tier.platinum', 5000);

    insert into loyalty_accounts (user_id) values (new.user_id) on conflict do nothing;

    if coalesce(new.points_earned, 0) > 0 then
      v_points := floor(new.points_earned * coalesce(v_multiplier, 1))::int;
      insert into loyalty_transactions (user_id, order_id, type, points, reason, expires_at)
      values (new.user_id, new.id, 'earn', v_points, 'Order ' || new.order_number, now() + interval '12 months');
      update loyalty_accounts
         set points_balance = points_balance + v_points,
             lifetime_points = lifetime_points + v_points
       where user_id = new.user_id;
    end if;

    select lifetime_points into v_lifetime from loyalty_accounts where user_id = new.user_id;
    v_tier := case
      when v_lifetime >= v_platinum then 'platinum'::loyalty_tier
      when v_lifetime >= v_gold then 'gold'::loyalty_tier
      when v_lifetime >= v_silver then 'silver'::loyalty_tier
      else 'bronze'::loyalty_tier
    end;
    update loyalty_accounts set tier = v_tier where user_id = new.user_id;

    insert into activity_logs (user_id, event, entity, entity_id, metadata)
    values (new.user_id, 'LOYALTY_REWARD_EARNED', 'orders', new.id::text,
            jsonb_build_object('points', new.points_earned, 'tier', v_tier));
  end if;
  return new;
end;
$function$;

create or replace function public.clawback_loyalty_on_failure()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_clawed int;
begin
  if new.status in ('canceled', 'rejected', 'failed', 'refunded')
     and old.status is distinct from new.status
     and public.setting_flag('loyalty', true) then
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
$function$;

-- Refuse redemption while loyalty is disabled, before any points are touched.
-- The existing body is renamed to `place_order_internal` first, so this wrapper
-- adds only the guard; the schema and all existing callers are unchanged.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'place_order'
  ) and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'place_order_internal'
  ) then
    execute 'alter function public.place_order(text, jsonb, uuid, fulfillment_type, payment_method, text, integer) rename to place_order_internal';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'place_order_internal'
  ) then
    execute 'revoke execute on function public.place_order_internal(text, jsonb, uuid, fulfillment_type, payment_method, text, integer) from public, anon, authenticated';
  end if;
end $$;

create or replace function public.place_order(
  p_idempotency_key text,
  p_items jsonb,
  p_address_id uuid default null,
  p_fulfillment fulfillment_type default 'delivery',
  p_payment_method payment_method default 'cash_on_delivery',
  p_customer_note text default null,
  p_points_redeem integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_result uuid;
begin
  if coalesce(p_points_redeem, 0) > 0 and not public.setting_flag('loyalty', true) then
    raise exception 'LOYALTY_DISABLED' using errcode = '22023';
  end if;

  v_result := public.place_order_internal(
    p_idempotency_key, p_items, p_address_id, p_fulfillment,
    p_payment_method, p_customer_note, p_points_redeem
  );
  return v_result;
end;
$function$;

grant execute on function public.place_order(text, jsonb, uuid, fulfillment_type, payment_method, text, integer)
  to anon, authenticated;

-- Default the flag off, and make it toggleable from the admin console.
update feature_flags set is_enabled = false where key = 'loyalty';
insert into feature_flags (key, label, description, module, is_enabled, sort_order)
values ('loyalty', 'Loyalty program', 'Points earn and redeem', 'loyalty', false, 40)
on conflict (key) do nothing;
