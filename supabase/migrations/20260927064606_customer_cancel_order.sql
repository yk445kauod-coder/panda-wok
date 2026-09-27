-- Panda Wok :: customer order cancellation was 100% broken
--
-- Root cause (verified against the live project, not just read from the code):
-- `cancelOrderAction` cancels with a plain `.update()` from the customer's own
-- session, but `orders` has **no customer UPDATE policy** — only
-- `orders_staff_update`. Under RLS an UPDATE that no policy admits is not an
-- error, it matches **zero rows**. PostgREST returns 204 with no `error`, so the
-- action reported success, the UI refreshed, and the order never changed. That
-- is the "takes forever without cancelling" symptom exactly.
--
-- Reproduced in a rolled-back transaction as the owning customer:
--   update orders set status='canceled' ... where id=... and user_id=...;
--   -> rows_updated_by_customer = 0
--
-- Fix: a `security definer` RPC, not a customer UPDATE policy. A policy cannot
-- restrict *columns*, so granting customers UPDATE on `orders` would also let
-- them rewrite `total`, `points_redeemed` or jump straight to `finished`. The
-- RPC is the narrow door: it locks the row, checks ownership and the status
-- window, and only ever writes the cancellation fields.
--
-- Idempotent: re-running replaces the function only.

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- Lock the row so two taps cannot race into a cancel-after-accept.
  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order.user_id is distinct from v_user then
    -- Same error as "not found": do not confirm that someone else's order exists.
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order.status not in ('new', 'accepted') then
    raise exception 'ORDER_NOT_CANCELABLE' using errcode = '22023';
  end if;

  update public.orders
     set status = 'canceled',
         cancel_reason = 'Canceled by customer',
         canceled_at = coalesce(canceled_at, now())
   where id = p_order_id;
end;
$$;

-- Called by the owning customer through the API, so `authenticated` needs
-- EXECUTE. The function itself enforces ownership, so anon must not.
revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;
