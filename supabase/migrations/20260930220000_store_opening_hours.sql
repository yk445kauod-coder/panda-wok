-- Owner-controlled opening hours.
--
-- The owner asked to keep the storefront available to customers only inside a
-- chosen window ("from 2 PM until 1 AM"), configurable from the admin console.
-- `ordering.accepting_orders` already existed as a manual on/off switch; this
-- adds the clock on top of it.
--
-- Settings (all public, so the storefront can render the state):
--   ordering.hours_enabled  boolean   -- false keeps the previous behaviour
--   ordering.open_time      "HH:MM"   -- 24h, restaurant-local
--   ordering.close_time     "HH:MM"   -- may be earlier than open (crosses midnight)
--
-- The window is evaluated in Africa/Cairo, not UTC: Workers run in UTC, and the
-- kitchen's hours are local. `store_is_open()` is the single source of truth, so
-- the checkout preview and `place_order` cannot disagree.
--
-- Nothing here touches menu data.

insert into public.settings (key, value, description, is_public)
values
  ('ordering.hours_enabled', 'false'::jsonb,
   'Restrict ordering to the opening window below.', true),
  ('ordering.open_time', '"14:00"'::jsonb,
   'Daily opening time (24h HH:MM, Africa/Cairo).', true),
  ('ordering.close_time', '"01:00"'::jsonb,
   'Daily closing time (24h HH:MM). Earlier than open = closes after midnight.', true)
on conflict (key) do nothing;

/**
 * True when the storefront may accept orders right now.
 *
 * Rules, in order:
 *   1. A malformed/absent window, or hours disabled -> the manual switch decides.
 *   2. The manual switch off -> closed (the owner can always close early).
 *   3. Otherwise -> inside the window.
 *
 * A malformed window deliberately fails *open* (per rule 1): the safe failure
 * for a restaurant is to keep taking orders, not to shut silently because a
 * setting was mistyped.
 */
create or replace function public.store_is_open(p_now timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_open text;
  v_close text;
  v_open_min int;
  v_close_min int;
  v_now_min int;
  v_manual boolean;
begin
  select (value = 'true'::jsonb) into v_enabled
    from public.settings where key = 'ordering.hours_enabled';
  select trim(both '"' from value::text) into v_open
    from public.settings where key = 'ordering.open_time';
  select trim(both '"' from value::text) into v_close
    from public.settings where key = 'ordering.close_time';

  select (value <> 'false'::jsonb) into v_manual
    from public.settings where key = 'ordering.accepting_orders';

  if coalesce(v_manual, true) is false then
    return false;
  end if;

  if not coalesce(v_enabled, false) then
    return true;
  end if;

  if v_open !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or v_close !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return true;
  end if;

  v_open_min  := split_part(v_open, ':', 1)::int * 60 + split_part(v_open, ':', 2)::int;
  v_close_min := split_part(v_close, ':', 1)::int * 60 + split_part(v_close, ':', 2)::int;
  v_now_min   := extract(hour from (p_now at time zone 'Africa/Cairo'))::int * 60
               + extract(minute from (p_now at time zone 'Africa/Cairo'))::int;

  -- Equal open/close means a full-day window rather than a zero-length one.
  if v_open_min = v_close_min then
    return true;
  end if;

  if v_open_min < v_close_min then
    return v_now_min >= v_open_min and v_now_min < v_close_min;
  end if;

  -- Crosses midnight: open in the evening OR in the small hours.
  return v_now_min >= v_open_min or v_now_min < v_close_min;
end;
$$;

-- Public read: the storefront and the agent both need the state, and it reveals
-- nothing beyond the hours the owner publishes anyway.
revoke execute on function public.store_is_open(timestamptz) from public;
grant execute on function public.store_is_open(timestamptz) to anon, authenticated;

/**
 * `place_order` gains the hours guard alongside the existing loyalty guard.
 *
 * Re-created rather than replaced so the return type stays the table shape the
 * app expects — assigning a `returns table` function into a scalar is a runtime
 * error, not a compile error (see 20260929190000).
 */
drop function if exists public.place_order(text, jsonb, uuid, fulfillment_type, payment_method, text, integer);

create function public.place_order(
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
set search_path = public
as $$
begin
  if not public.store_is_open() then
    raise exception 'STORE_CLOSED' using errcode = '22023';
  end if;

  if coalesce(p_points_redeem, 0) > 0 and not public.setting_flag('loyalty', true) then
    raise exception 'LOYALTY_DISABLED' using errcode = '22023';
  end if;

  return query
    select *
      from public.place_order_internal(
        p_idempotency_key, p_items, p_address_id, p_fulfillment,
        p_payment_method, p_customer_note, p_points_redeem
      );
end;
$$;

revoke execute on function public.place_order_internal(text, jsonb, uuid, fulfillment_type, payment_method, text, integer) from anon, authenticated;
grant execute on function public.place_order(text, jsonb, uuid, fulfillment_type, payment_method, text, integer) to anon, authenticated;
