-- Remove features that were never used.
--
-- Owner request: drop the loyalty, stock, upsell, broadcast and agent-automation
-- tables. Every one of them is empty in production (verified row counts: 0), so
-- nothing is lost. `delivery_zones` is deliberately NOT dropped — the owner
-- cancelled that part of the request.
--
-- Ordering matters: several live functions still reference these tables
-- (`place_order_internal` redeems loyalty points; `crm_customers` / `crm_segment`
-- / `segment_user_ids` read `loyalty_accounts`). A naive `drop ... cascade` would
-- take those functions with it and break ordering and the CRM, so each one is
-- rewritten first to read without the dropped tables.
--
-- Idempotent: `create or replace`, `if exists`, and `drop ... if exists` on
-- every statement, so a re-run is a no-op.

-- ---------------------------------------------------------------------------
-- 1. Rewrite the functions that referenced the dropped tables.
-- ---------------------------------------------------------------------------

-- place_order: the loyalty-disabled guard goes away with the programme. The
-- p_points_redeem argument stays (callers still pass it) but is now inert.
create or replace function public.place_order(
  p_idempotency_key text,
  p_items jsonb,
  p_address_id uuid default null,
  p_fulfillment fulfillment_type default 'delivery',
  p_payment_method payment_method default 'cash_on_delivery',
  p_customer_note text default null,
  p_points_redeem integer default 0
)
returns table(order_id uuid, order_number text, total numeric, reused boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.store_is_open() then
    raise exception 'STORE_CLOSED' using errcode = '22023';
  end if;

  return query
    select *
      from public.place_order_internal(
        p_idempotency_key, p_items, p_address_id, p_fulfillment,
        p_payment_method, p_customer_note, p_points_redeem
      );
end;
$function$;

-- place_order_internal: identical to the previous body except the loyalty
-- redemption block (loyalty_accounts / loyalty_transactions) is gone. Points
-- redemption was already retired at checkout, so the branch was unreachable in
-- practice; removing it only deletes dead code and the table dependency.
create or replace function public.place_order_internal(
  p_idempotency_key text,
  p_items jsonb,
  p_address_id uuid default null,
  p_fulfillment fulfillment_type default 'delivery',
  p_payment_method payment_method default 'cash_on_delivery',
  p_customer_note text default null,
  p_points_redeem integer default 0
)
returns table(order_id uuid, order_number text, total numeric, reused boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing orders%rowtype;
  v_order_id uuid;
  v_number text;
  v_subtotal numeric(10, 2) := 0;
  v_points_discount numeric(10, 2) := 0;
  v_offer_discount numeric(10, 2) := 0;
  v_discount numeric(10, 2) := 0;
  v_delivery numeric(10, 2) := 0;
  v_tax numeric(10, 2) := 0;
  v_total numeric(10, 2) := 0;
  v_delivery_fee numeric(10, 2);
  v_free_over numeric(10, 2);
  v_tax_rate numeric(5, 4);
  v_min_order numeric(10, 2);
  v_max_qty int;
  v_addr addresses%rowtype;
  v_snapshot jsonb;
  v_points_per_currency numeric(10, 4);
  v_points int := 0;
  v_minutes int := 0;
  v_offer_id uuid;
  v_offer_name text;
  rec record;
  v_item menu_items%rowtype;
  v_mods jsonb;
  v_group record;
  v_opts jsonb;
  v_opt record;
  v_mod_delta numeric(10, 2);
  v_line numeric(10, 2);
  v_count int := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 60 then
    raise exception 'CART_TOO_LARGE' using errcode = '22023';
  end if;

  select * into v_existing from orders
   where user_id = v_uid and idempotency_key = p_idempotency_key
   limit 1;
  if found then
    return query select v_existing.id, v_existing.order_number, v_existing.total, true;
    return;
  end if;

  if exists (select 1 from profiles where id = v_uid and is_blocked) then
    raise exception 'ACCOUNT_BLOCKED' using errcode = '42501';
  end if;

  -- Cloud kitchen: there is no counter to collect from, so the only fulfilment
  -- that can actually be honoured is delivery.
  if p_fulfillment <> 'delivery' then
    raise exception 'PICKUP_UNAVAILABLE' using errcode = '22023';
  end if;

  v_delivery_fee := public.setting_numeric('delivery.fee', 30);
  v_free_over := public.setting_numeric('delivery.free_over', 250);
  v_tax_rate := public.setting_numeric('tax.rate', 0.14);
  v_min_order := public.setting_numeric('ordering.min_order_total', 80);
  v_max_qty := public.setting_numeric('ordering.max_qty_per_item', 20);
  v_points_per_currency := public.setting_numeric('loyalty.points_per_currency', 1);

  if p_address_id is null then
    raise exception 'ADDRESS_REQUIRED' using errcode = '22023';
  end if;
  select * into v_addr from addresses where id = p_address_id and user_id = v_uid;
  if not found then
    raise exception 'ADDRESS_NOT_FOUND' using errcode = '22023';
  end if;
  if coalesce(trim(v_addr.address_line), '') = '' then
    raise exception 'ADDRESS_INVALID' using errcode = '22023';
  end if;
  v_snapshot := jsonb_build_object(
    'label', v_addr.label, 'contact_name', v_addr.contact_name,
    'contact_phone', v_addr.contact_phone, 'address_line', v_addr.address_line,
    'building', v_addr.building, 'floor', v_addr.floor, 'apartment', v_addr.apartment,
    'landmark', v_addr.landmark, 'area', v_addr.area, 'city', v_addr.city,
    'notes', v_addr.notes, 'latitude', v_addr.latitude, 'longitude', v_addr.longitude
  );

  v_number := public.next_order_number();

  insert into orders (
    order_number, idempotency_key, user_id, status, fulfillment, payment_method,
    payment_status, address_snapshot, customer_note, eta_minutes
  ) values (
    v_number, p_idempotency_key, v_uid, 'new', p_fulfillment, p_payment_method,
    'unpaid', v_snapshot, nullif(trim(coalesce(p_customer_note, '')), ''), 0
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_order_id;

  if v_order_id is null then
    select * into v_existing from orders
     where user_id = v_uid and idempotency_key = p_idempotency_key limit 1;
    return query select v_existing.id, v_existing.order_number, v_existing.total, true;
    return;
  end if;

  for rec in
    select
      (elem ->> 'menu_item_id')::uuid as menu_item_id,
      greatest(1, coalesce((elem ->> 'quantity')::int, 1)) as quantity,
      coalesce(elem -> 'modifiers', '[]'::jsonb) as modifiers,
      nullif(trim(coalesce(elem ->> 'notes', '')), '') as notes
    from jsonb_array_elements(p_items) as elem
  loop
    v_count := v_count + 1;

    if rec.quantity > v_max_qty then
      raise exception 'QUANTITY_LIMIT_EXCEEDED' using errcode = '22023';
    end if;

    select * into v_item from menu_items where id = rec.menu_item_id;
    if not found then
      raise exception 'ITEM_NOT_FOUND' using errcode = '22023';
    end if;
    if not v_item.is_available or v_item.is_archived then
      raise exception 'ITEM_UNAVAILABLE:%', v_item.name_en using errcode = 'P0001';
    end if;
    if not exists (select 1 from categories c where c.id = v_item.category_id and c.is_enabled) then
      raise exception 'ITEM_UNAVAILABLE:%', v_item.name_en using errcode = 'P0001';
    end if;

    v_mods := coalesce((
      select jsonb_agg(distinct value)
        from jsonb_array_elements_text(rec.modifiers) as t(value)
       where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ), '[]'::jsonb);

    for v_group in
      select
        mg.id,
        mg.min_select,
        mg.max_select,
        mg.is_required,
        (
          select count(distinct mo.id)
            from jsonb_array_elements_text(v_mods) as selected(id)
            join modifier_options mo on mo.id = (selected.id)::uuid
           where mo.group_id = mg.id and mo.is_available
        ) as chosen
        from modifier_groups mg
       where mg.menu_item_id = v_item.id
    loop
      if v_group.chosen > v_group.max_select then
        raise exception 'MODIFIER_LIMIT_EXCEEDED:%', v_item.name_en using errcode = '22023';
      end if;
      if v_group.is_required and v_group.chosen < v_group.min_select then
        raise exception 'VALIDATION:%', v_item.name_en using errcode = '22023';
      end if;
    end loop;

    v_mod_delta := 0;
    v_opts := '[]'::jsonb;
    for v_opt in
      select mo.id, mo.name_en, mo.price_delta
        from jsonb_array_elements_text(v_mods) as selected(id)
        join modifier_options mo on mo.id = (selected.id)::uuid
        join modifier_groups mg on mg.id = mo.group_id
       where mg.menu_item_id = v_item.id and mo.is_available
    loop
      v_mod_delta := v_mod_delta + v_opt.price_delta;
      v_opts := v_opts || jsonb_build_object(
        'id', v_opt.id, 'name', v_opt.name_en, 'price_delta', v_opt.price_delta
      );
    end loop;

    v_line := round((v_item.price + v_mod_delta) * rec.quantity, 2);
    v_subtotal := v_subtotal + v_line;
    v_minutes := greatest(v_minutes, v_item.prep_minutes);

    insert into order_items (
      order_id, menu_item_id, name_snapshot, name_ar_snapshot,
      unit_price, quantity, line_total, modifiers, notes
    ) values (
      v_order_id, v_item.id, v_item.name_en, v_item.name_ar,
      v_item.price + v_mod_delta, rec.quantity, v_line, v_opts, rec.notes
    );
  end loop;

  if v_count = 0 then
    raise exception 'EMPTY_CART' using errcode = '22023';
  end if;

  if v_subtotal < v_min_order then
    raise exception 'MIN_ORDER_NOT_MET' using errcode = '22023';
  end if;

  -- Single best threshold offer on the basket subtotal. (Loyalty redemption
  -- used to be applied first; the programme is gone, so the discount is the
  -- offer alone.)
  select b.offer_id, b.offer_name_en, b.amount
    into v_offer_id, v_offer_name, v_offer_discount
    from public.best_offer(v_subtotal) b;
  v_offer_discount := coalesce(v_offer_discount, 0);

  -- Never discount below zero, whatever the rules combine to.
  v_discount := least(v_points_discount + v_offer_discount, v_subtotal);

  v_delivery := case when v_subtotal >= v_free_over then 0 else v_delivery_fee end;

  v_tax := round((v_subtotal - v_discount + v_delivery) * v_tax_rate, 2);
  v_total := round(v_subtotal - v_discount + v_delivery + v_tax, 2);

  if v_total <= 0 then
    raise exception 'INVALID_TOTAL' using errcode = '22023';
  end if;

  v_points := floor(v_total * v_points_per_currency)::int;

  update orders
     set subtotal = v_subtotal,
         discount_total = v_discount,
         delivery_fee = v_delivery,
         tax_total = v_tax,
         total = v_total,
         points_redeemed = round(v_points_discount)::int,
         points_earned = v_points,
         offer_id = v_offer_id,
         offer_name = v_offer_name,
         eta_minutes = public.setting_numeric('delivery.eta_minutes', 35)::int
   where id = v_order_id;

  insert into activity_logs (user_id, event, entity, entity_id, metadata)
  values (v_uid, 'ORDER_CREATED', 'orders', v_order_id::text,
          jsonb_build_object('total', v_total, 'items', v_count,
                             'offer', v_offer_name, 'offer_discount', v_offer_discount));

  return query select v_order_id, v_number, v_total, false;
end;
$function$;

-- crm_customers: points_balance/tier were sourced from loyalty_accounts. The
-- account list still shows those columns (the UI renders them), so they stay in
-- the shape but are now constant: no programme means no points and the base tier.
-- The return type changes (tier was the loyalty_tier enum, now text), and a
-- function's return type cannot be altered in place, so drop it first.
drop function if exists public.crm_customers(text, integer, integer);
create or replace function public.crm_customers(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  user_id uuid, full_name text, phone text, email text,
  created_at timestamp with time zone, last_seen_at timestamp with time zone,
  last_order_at timestamp with time zone, order_count bigint,
  lifetime_value numeric, avg_order_value numeric, days_since_last_order integer,
  points_balance integer, tier text, favorite_items jsonb,
  is_blocked boolean, marketing_opt_in boolean
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    p.id,
    p.full_name,
    p.phone,
    p.email,
    p.created_at,
    p.last_seen_at,
    o.last_order_at,
    coalesce(o.order_count, 0),
    coalesce(o.lifetime_value, 0),
    case when coalesce(o.order_count, 0) > 0
      then round(coalesce(o.lifetime_value, 0) / o.order_count, 2) else 0 end,
    case when o.last_order_at is null then null
      else extract(day from now() - o.last_order_at)::int end,
    0,
    'bronze',
    coalesce(fav.items, '[]'::jsonb),
    p.is_blocked,
    p.marketing_opt_in
  from profiles p
  left join (
    select
      ord.user_id,
      max(ord.created_at) as last_order_at,
      count(*) filter (where ord.status not in ('canceled', 'rejected', 'failed')) as order_count,
      sum(ord.total) filter (where ord.status = 'finished') as lifetime_value
    from orders ord
    group by ord.user_id
  ) o on o.user_id = p.id
  left join lateral (
    select jsonb_agg(x.name order by x.qty desc) as items
    from (
      select oi.name_snapshot as name, sum(oi.quantity) as qty
        from order_items oi
        join orders o2 on o2.id = oi.order_id
       where o2.user_id = p.id
       group by oi.name_snapshot
       order by qty desc
       limit 3
    ) x
  ) fav on true
  where (p_search is null or p_search = ''
         or p.full_name ilike '%' || p_search || '%'
         or p.phone ilike '%' || p_search || '%'
         or p.email ilike '%' || p_search || '%')
  order by o.last_order_at desc nulls last, p.created_at desc
  limit greatest(1, least(p_limit, 1000)) offset greatest(0, p_offset);
$function$;

-- crm_segment: the 'loyalty_members' branch read loyalty_accounts. That segment
-- no longer exists, so the branch is removed; unknown segments still match
-- nothing (the else false).
create or replace function public.crm_segment(p_segment text, p_value integer default 30)
returns table(user_id uuid)
language sql
stable security definer
set search_path to 'public'
as $function$
  with agg as (
    select ord.user_id, max(ord.created_at) as last_order_at,
           count(*) as order_count, sum(ord.total) as spend
      from orders ord
     where ord.status not in ('canceled', 'rejected', 'failed')
     group by ord.user_id
  )
  select p.id from profiles p
  left join agg a on a.user_id = p.id
  where
    case p_segment
      when 'all' then true
      when 'opted_in' then p.marketing_opt_in
      when 'new' then p.created_at > now() - interval '30 days'
      when 'loyal' then coalesce(a.order_count, 0) >= 3
      when 'inactive' then coalesce(a.last_order_at, 'epoch'::timestamptz) < now() - make_interval(days => greatest(p_value, 1))
      when 'never_ordered' then coalesce(a.order_count, 0) = 0
      when 'high_value' then coalesce(a.spend, 0) >= greatest(p_value, 1)
      when 'winback' then coalesce(a.last_order_at, 'epoch'::timestamptz) between now() - interval '90 days' and now() - interval '30 days'
      else false
    end;
$function$;

-- segment_user_ids: same 'loyalty_members' branch removed.
create or replace function public.segment_user_ids(p_segment text, p_value integer default 30)
returns setof uuid
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if p_segment = 'all' then
    return query select p.id from profiles p where not p.is_blocked;

  elsif p_segment = 'opted_in' then
    return query
      select p.id from profiles p
      where p.marketing_opt_in and not p.is_blocked;

  elsif p_segment = 'new' then
    return query
      select p.id from profiles p
      where p.created_at >= now() - make_interval(days => p_value)
        and not p.is_blocked;

  elsif p_segment = 'loyal' then
    return query
      select o.user_id from orders o
      where not public.order_is_terminal(o.status)
      group by o.user_id
      having count(*) >= 3;

  elsif p_segment = 'inactive' then
    return query
      select o.user_id from orders o
      where not public.order_is_terminal(o.status)
      group by o.user_id
      having max(o.created_at) < now() - make_interval(days => p_value);

  elsif p_segment = 'never_ordered' then
    return query
      select p.id from profiles p
      where not p.is_blocked
        and not exists (
          select 1 from orders o
          where o.user_id = p.id and not public.order_is_terminal(o.status)
        );

  elsif p_segment = 'high_value' then
    return query
      select o.user_id from orders o
      where not public.order_is_terminal(o.status)
      group by o.user_id
      having sum(o.total) >= p_value;

  elsif p_segment = 'winback' then
    return query
      select o.user_id from orders o
      where not public.order_is_terminal(o.status)
      group by o.user_id
      having max(o.created_at) between now() - interval '90 days'
                                   and now() - interval '30 days';

  else
    return;
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Drop the orders triggers that awarded/clawed back loyalty points. The order
--    columns (points_earned/points_redeemed) stay; nothing maintains them now.
-- ---------------------------------------------------------------------------
drop trigger if exists orders_award_loyalty on public.orders;
drop trigger if exists orders_clawback_loyalty on public.orders;

-- ---------------------------------------------------------------------------
-- 3. Drop the tables (all verified empty). delivery_zones is intentionally kept.
--    Doing this before the functions lets each table take its own triggers with
--    it, so the functions below are no longer referenced.
-- ---------------------------------------------------------------------------
drop table if exists public.loyalty_redemptions cascade;
drop table if exists public.loyalty_transactions cascade;
drop table if exists public.loyalty_rewards cascade;
drop table if exists public.loyalty_accounts cascade;

drop table if exists public.stock_movements cascade;
drop table if exists public.menu_item_stock cascade;
drop table if exists public.stock_items cascade;

drop table if exists public.upsell_rules cascade;

drop table if exists public.broadcast_recipients cascade;
drop table if exists public.broadcasts cascade;

drop table if exists public.ai_knowledge_sources cascade;
drop table if exists public.agent_automations cascade;

-- ---------------------------------------------------------------------------
-- 4. Drop the functions that existed only for the dropped tables. Dropped by
--    name across every overload, so the statement does not depend on the exact
--    argument list drifting between environments.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'award_loyalty_on_finish', 'clawback_loyalty_on_failure',
         'gift_loyalty_points', 'send_broadcast', 'apply_stock_movement',
         'recompute_stock_status', 'stock_quantity_changed',
         'record_automation_run', 'set_automation_next_run'
       )
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Drop the enums that only those tables used. `loyalty_tier` is safe now
--    that crm_customers no longer returns it.
-- ---------------------------------------------------------------------------
drop type if exists public.loyalty_tier;
drop type if exists public.loyalty_txn_type;
drop type if exists public.broadcast_channel;
drop type if exists public.broadcast_status;
drop type if exists public.stock_direction;
drop type if exists public.stock_status;

-- ---------------------------------------------------------------------------
-- 6. Remove the feature flags that gated the removed features.
-- ---------------------------------------------------------------------------
delete from public.feature_flags where key in ('loyalty', 'upsell', 'broadcast');
