-- Panda Wok :: place_order returned the wrong shape, so every checkout failed
--
-- `20260929000100_realtime_and_loyalty_default.sql` added a thin wrapper so a
-- loyalty redemption while the programme is off raises LOYALTY_DISABLED. The
-- wrapper was declared `returns uuid` but its body assigns the four-column
-- table function `place_order_internal` into that scalar:
--
--     v_result uuid;
--     v_result := public.place_order_internal(...);
--
-- `place_order` is not a `returns table`, so `v_result := fn(...)` does not
-- invoke the function at all — it reads the row as a whole and coerces the
-- composite `(order_id, order_number, total, reused)` to `uuid`. That coerces
-- fine while the call is unresolved (which is why the syntax/type check passed
-- at migration time), and fails at *run* time with:
--
--     ERROR: 22P02: invalid input syntax for type uuid:
--            "(5253bbb4-…,PW-2609-1043,680.00,f)"
--
-- The order row is inserted and then the whole transaction aborts, so the
-- customer saw "something went wrong" while the kitchen saw cancelled orders.
-- Live evidence: POST /rest/v1/rpc/place_order -> 400, and 4 of the 5 stored
-- orders in that window ended in the cancelled/rejected/failed bucket.
--
-- The fix restores the wrapper's real contract: same signature as the function
-- it guards, returning `table(order_id, order_number, total, reused)`, with the
-- guard still in place so checkout behaviour is otherwise unchanged.

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

-- `place_order` is checked for EXECUTE as the invoking role and is the only
-- order path the app uses; `place_order_internal` stays revoked (see
-- 20260929000100) so the loyalty guard cannot be bypassed by calling it direct.
revoke execute on function public.place_order_internal(text, jsonb, uuid, fulfillment_type, payment_method, text, integer) from anon, authenticated;
grant execute on function public.place_order(text, jsonb, uuid, fulfillment_type, payment_method, text, integer) to anon, authenticated;
