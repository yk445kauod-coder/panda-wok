-- Panda Wok :: admin-controlled offers, and delivery-only fulfilment
--
-- Two changes that belong together, because both rewrite `place_order`.
--
-- 1. OFFERS. The brief asked for "a discount when the order goes over a certain
--    amount", controlled from the admin console rather than hardcoded. There was
--    no offers/promotions table at all, and the only discount that existed was
--    loyalty-point redemption. This adds a real `offers` table with a threshold
--    and either a percentage or a flat amount, plus the rule for picking one.
--
--    The table ships EMPTY on purpose. Nothing visitor-facing in this project is
--    invented, so no "50 off" row is seeded: the owner creates the offer in
--    Admin -> Offers and it starts applying immediately. Until then the checkout
--    shows no promotion, which is the honest state.
--
--    Only one offer applies per order — the one that saves the customer the
--    most. Stacking several threshold promotions is how a kitchen accidentally
--    sells below cost, and a single "you saved X" line is easier to reason about
--    than a stack of overlapping rules.
--
-- 2. DELIVERY ONLY. This is a cloud kitchen: there is no counter, so "pickup"
--    was never a real choice and offering it invited customers to select a
--    fulfilment the kitchen could not honour. The `fulfillment_type` enum keeps
--    the 'pickup' label so historical orders still read correctly, but
--    `place_order` now rejects anything but 'delivery' and always requires an
--    address. The app-side schema and checkout UI drop the choice too.

-- ------------------------------------------------------------------- offers

create type offer_kind as enum ('percent', 'fixed');

create table offers (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text,
  kind offer_kind not null default 'fixed',
  -- Minimum basket subtotal before the offer applies. 0 means "always".
  threshold numeric(10, 2) not null default 0 check (threshold >= 0),
  -- Percentage (0-100) when kind = 'percent', otherwise the flat EGP amount.
  value numeric(10, 2) not null check (value >= 0),
  -- Optional ceiling for a percentage offer, so "20% off" cannot mean an
  -- unbounded giveaway on a very large order.
  max_discount numeric(10, 2) check (max_discount is null or max_discount >= 0),
  is_enabled boolean not null default true,
  sort_order int not null default 0,
  restaurant_id uuid not null default public.current_restaurant_id()
    references restaurants (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_percent_range check (kind <> 'percent' or value <= 100)
);
create index offers_active_idx on offers (is_enabled, threshold);
create index offers_restaurant_idx on offers (restaurant_id);

create trigger offers_touch before update on offers
  for each row execute function public.touch_updated_at();

-- Who may manage offers. Deliberately the same set the app gates the page on
-- (`menu.manage` = owner, admin, manager, marketing), so the console never
-- offers an action the database would then reject.
create or replace function public.can_manage_offers()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_staff_role() in ('owner', 'admin', 'manager', 'marketing');
$$;

alter table offers enable row level security;

-- Customers must be able to read the live promotions so checkout can preview
-- the saving. Only enabled rows, and only within the current tenant.
create policy offers_public_read on offers
  for select to anon, authenticated
  using (is_enabled and restaurant_id = public.current_restaurant_id());

create policy offers_staff_read on offers
  for select to authenticated
  using (is_staff() and restaurant_id = public.current_restaurant_id());

create policy offers_staff_write on offers
  for all to authenticated
  using (public.can_manage_offers() and restaurant_id = public.current_restaurant_id())
  with check (public.can_manage_offers() and restaurant_id = public.current_restaurant_id());

-- Internal-only helper: the offer that saves the customer the most on this
-- subtotal. Ties break towards the lower sort_order, then the older row, so the
-- choice is deterministic rather than "whichever the planner returned first".
create or replace function public.best_offer(p_subtotal numeric)
returns table (
  offer_id uuid,
  offer_name_en text,
  offer_name_ar text,
  offer_kind offer_kind,
  amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      o.id,
      o.name_en,
      o.name_ar,
      o.kind,
      o.sort_order,
      o.created_at,
      least(
        case
          when o.kind = 'percent' then round(p_subtotal * o.value / 100, 2)
          else o.value
        end,
        coalesce(o.max_discount, 1e12),
        p_subtotal
      ) as amount
    from offers o
    where o.is_enabled
      and o.restaurant_id = public.current_restaurant_id()
      and p_subtotal >= o.threshold
  )
  select c.id, c.name_en, c.name_ar, c.kind, c.amount
  from candidates c
  where c.amount > 0
  order by c.amount desc, c.sort_order asc, c.created_at asc
  limit 1;
$$;

-- ------------------------------------------------------------------ orders

-- The applied offer is recorded on the order so the admin can see why a total
-- was discounted without reconstructing the rules from history.
alter table orders add column offer_id uuid references offers (id) on delete set null;
alter table orders add column offer_name text;
create index orders_offer_idx on orders (offer_id);

-- ------------------------------------------------------------- place_order

create or replace function public.place_order(
  p_idempotency_key text,
  p_items jsonb,
  p_address_id uuid default null,
  p_fulfillment fulfillment_type default 'delivery',
  p_payment_method payment_method default 'cash_on_delivery',
  p_customer_note text default null,
  p_points_redeem integer default 0
)
returns table (order_id uuid, order_number text, total numeric, reused boolean)
language plpgsql
security definer
set search_path = public
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
  v_redeem_value numeric(10, 2);
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

  -- Loyalty redemption first: it is the customer's own balance being spent, and
  -- the cap is half the subtotal.
  if coalesce(p_points_redeem, 0) > 0 then
    select points_balance into v_balance from loyalty_accounts where user_id = v_uid;
    if coalesce(v_balance, 0) <= 0 then
      raise exception 'NO_LOYALTY_POINTS' using errcode = '22023';
    end if;
    v_redeem_value := least(p_points_redeem::numeric, v_balance::numeric, round(v_subtotal * 0.5, 2));
    if v_redeem_value > 0 then
      v_points_discount := round(v_redeem_value, 2);
      insert into loyalty_transactions (user_id, order_id, type, points, reason, created_by)
      values (v_uid, v_order_id, 'redeem', -round(v_redeem_value)::int, 'Redeemed at checkout', v_uid);
      update loyalty_accounts
         set points_balance = points_balance - round(v_redeem_value)::int
       where user_id = v_uid;
    end if;
  end if;

  -- Then the single best threshold offer on the basket subtotal.
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
         eta_minutes = v_minutes + 20
   where id = v_order_id;

  insert into activity_logs (user_id, event, entity, entity_id, metadata)
  values (v_uid, 'ORDER_CREATED', 'orders', v_order_id::text,
          jsonb_build_object('total', v_total, 'items', v_count,
                             'offer', v_offer_name, 'offer_discount', v_offer_discount));

  return query select v_order_id, v_number, v_total, false;
end;
$function$;
