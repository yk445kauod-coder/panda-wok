-- Panda Wok :: server-side business logic
-- Order placement, totals, loyalty awarding, CRM segmentation.

-- ---------------------------------------------------------------------------
-- Typed settings accessor. Values are stored as jsonb and may be numbers or
-- strings; business logic must never crash on a malformed config row.
-- ---------------------------------------------------------------------------
create or replace function public.setting_numeric(p_key text, p_default numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select value into v from settings where key = p_key;
  if v is null then
    return p_default;
  elsif jsonb_typeof(v) = 'number' then
    return (v::text)::numeric;
  elsif jsonb_typeof(v) = 'string' then
    begin
      return (v #>> '{}')::numeric;
    exception when others then
      return p_default;
    end;
  end if;
  return p_default;
end;
$$;

create sequence if not exists order_number_seq start 1000;

create or replace function public.next_order_number()
returns text
language plpgsql
as $$
begin
  return 'PW-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('order_number_seq')::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- place_order: the single authoritative way an order is created.
-- Recomputes every price from the database, rejects unavailable items, caps
-- quantities, and de-duplicates retries through (user_id, idempotency_key).
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_idempotency_key text,
  p_items jsonb,
  p_address_id uuid default null,
  p_fulfillment fulfillment_type default 'delivery',
  p_payment_method payment_method default 'cash_on_delivery',
  p_customer_note text default null,
  p_points_redeem int default 0
)
returns table (order_id uuid, order_number text, total numeric, reused boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing orders%rowtype;
  v_order_id uuid;
  v_number text;
  v_subtotal numeric(10, 2) := 0;
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
  v_redeem_value numeric(10, 2);
  v_points_per_currency numeric(10, 4);
  v_points int := 0;
  v_minutes int := 0;
  rec record;
  v_item menu_items%rowtype;
  v_opts jsonb;
  v_opt record;
  v_mod_delta numeric(10, 2);
  v_line numeric(10, 2);
  v_count int := 0;
  v_balance int;
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

  -- Return the original order instead of creating a duplicate on retry.
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

  v_delivery_fee := public.setting_numeric('delivery.fee', 30);
  v_free_over := public.setting_numeric('delivery.free_over', 250);
  v_tax_rate := public.setting_numeric('tax.rate', 0.14);
  v_min_order := public.setting_numeric('ordering.min_order_total', 80);
  v_max_qty := public.setting_numeric('ordering.max_qty_per_item', 20);
  v_points_per_currency := public.setting_numeric('loyalty.points_per_currency', 1);

  if p_fulfillment = 'delivery' then
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
  else
    v_snapshot := jsonb_build_object('mode', 'pickup');
  end if;

  v_number := public.next_order_number();

  -- The unique index on (user_id, idempotency_key) is the race guard.
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

    v_mod_delta := 0;
    v_opts := '[]'::jsonb;
    for v_opt in
      select mo.id, mo.name_en, mo.price_delta
        from jsonb_array_elements_text(rec.modifiers) as selected(id)
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

  -- Loyalty redemption: 1 point = 1 EGP, capped at half the basket so the
  -- kitchen is never asked to fulfil an order for free by mistake.
  if coalesce(p_points_redeem, 0) > 0 then
    select points_balance into v_balance from loyalty_accounts where user_id = v_uid;
    if coalesce(v_balance, 0) <= 0 then
      raise exception 'NO_LOYALTY_POINTS' using errcode = '22023';
    end if;
    v_redeem_value := least(p_points_redeem::numeric, v_balance::numeric, round(v_subtotal * 0.5, 2));
    if v_redeem_value > 0 then
      v_discount := round(v_redeem_value, 2);
      insert into loyalty_transactions (user_id, order_id, type, points, reason, created_by)
      values (v_uid, v_order_id, 'redeem', -round(v_redeem_value)::int, 'Redeemed at checkout', v_uid);
      update loyalty_accounts
         set points_balance = points_balance - round(v_redeem_value)::int
       where user_id = v_uid;
    end if;
  end if;

  if p_fulfillment = 'delivery' then
    v_delivery := case when v_subtotal >= v_free_over then 0 else v_delivery_fee end;
  else
    v_delivery := 0;
  end if;

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
         points_redeemed = round(v_discount)::int,
         points_earned = v_points,
         eta_minutes = v_minutes + case when p_fulfillment = 'delivery' then 20 else 0 end
   where id = v_order_id;

  insert into activity_logs (user_id, event, entity, entity_id, metadata)
  values (v_uid, 'ORDER_CREATED', 'orders', v_order_id::text,
          jsonb_build_object('total', v_total, 'items', v_count));

  return query select v_order_id, v_number, v_total, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Loyalty awarding + tier recalculation on order completion.
-- ---------------------------------------------------------------------------
create or replace function public.award_loyalty_on_finish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_multiplier numeric(10, 4);
  v_silver numeric;
  v_gold numeric;
  v_platinum numeric;
  v_lifetime int;
  v_tier loyalty_tier;
  v_points int;
begin
  if new.status = 'finished' and old.status is distinct from 'finished' then
    v_multiplier := public.setting_numeric('loyalty.multiplier', 1);
    v_silver := public.setting_numeric('loyalty.tier.silver', 500);
    v_gold := public.setting_numeric('loyalty.tier.gold', 2000);
    v_platinum := public.setting_numeric('loyalty.tier.platinum', 5000);

    insert into loyalty_accounts (user_id) values (new.user_id) on conflict do nothing;

    if coalesce(new.points_earned, 0) > 0 then
      v_points := floor(new.points_earned * coalesce(v_multiplier, 1))::int;
      insert into loyalty_transactions (user_id, order_id, type, points, reason, expires_at)
      values (new.user_id, new.id, 'earn', v_points, 'Order ' || new.order_number,
              now() + interval '12 months');

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
$$;

create trigger orders_award_loyalty
  after update of status on orders
  for each row execute function public.award_loyalty_on_finish();

-- ---------------------------------------------------------------------------
-- CRM: single source of truth for the customer 360 view.
-- ---------------------------------------------------------------------------
create or replace function public.crm_customers(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  email text,
  created_at timestamptz,
  last_seen_at timestamptz,
  last_order_at timestamptz,
  order_count bigint,
  lifetime_value numeric,
  avg_order_value numeric,
  days_since_last_order int,
  points_balance int,
  tier loyalty_tier,
  favorite_items jsonb,
  is_blocked boolean,
  marketing_opt_in boolean
)
language sql
stable
security definer
set search_path = public
as $$
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
    coalesce(la.points_balance, 0),
    coalesce(la.tier, 'bronze'),
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
  left join loyalty_accounts la on la.user_id = p.id
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
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$$;

-- Segments are computed from real data, never invented.
create or replace function public.crm_segment(p_segment text, p_value int default 30)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with agg as (
    select ord.user_id,
           max(ord.created_at) as last_order_at,
           count(*) as order_count,
           sum(ord.total) as spend
      from orders ord
     where ord.status not in ('canceled', 'rejected', 'failed')
     group by ord.user_id
  )
  select p.id from profiles p
  left join agg a on a.user_id = p.id
  left join loyalty_accounts la on la.user_id = p.id
  where
    case p_segment
      when 'all' then true
      when 'opted_in' then p.marketing_opt_in
      when 'new' then p.created_at > now() - interval '30 days'
      when 'loyal' then coalesce(a.order_count, 0) >= 3
      when 'inactive' then coalesce(a.last_order_at, 'epoch'::timestamptz) < now() - make_interval(days => greatest(p_value, 1))
      when 'never_ordered' then coalesce(a.order_count, 0) = 0
      when 'high_value' then coalesce(a.spend, 0) >= greatest(p_value, 1)
      when 'loyalty_members' then coalesce(la.points_balance, 0) > 0
      when 'winback' then coalesce(a.last_order_at, 'epoch'::timestamptz) between now() - interval '90 days' and now() - interval '30 days'
      else false
    end;
$$;

create or replace function public.crm_estimate_segment(p_segment text, p_value int default 30)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.crm_segment(p_segment, p_value);
$$;

-- Ordering a specific item is a segment driver ("customers who ordered ramen").
create or replace function public.crm_ordered_item(p_menu_item_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct o.user_id
    from orders o
    join order_items oi on oi.order_id = o.id
   where oi.menu_item_id = p_menu_item_id
     and o.status not in ('canceled', 'rejected', 'failed');
$$;
