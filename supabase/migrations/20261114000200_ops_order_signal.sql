-- A realtime signal the ops console can actually receive.
--
-- The console is opened with a cookie (the ops passcode / staff login id), not a
-- Supabase session, so its browser client is anonymous. Every `postgres_changes`
-- subscription on `orders` therefore delivers nothing: the staff RLS policy
-- resolves through `auth.uid()`, and a cookie has none. The channel still
-- reports SUBSCRIBED, which made the boards believe realtime was live while they
-- received silence.
--
-- A public broadcast sidesteps that: it carries no row data, so there is nothing
-- to authorise, and an anonymous client can subscribe. The trigger sends only a
-- "something changed" ping; the console then re-reads through the gated
-- `/api/admin/*` routes, so no order content ever leaves the database over this
-- channel. That turns the poll from the only path into a safety net, which is
-- what keeps a console with several open tabs inside the Worker's request budget.

create or replace function public.signal_ops_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('at', now()),
    'order_changed',
    'ops-orders',
    false
  );
  return null;
exception
  when others then
    -- A signalling hiccup must never fail the write that triggered it.
    return null;
end;
$$;

comment on function public.signal_ops_order_change() is
  'Broadcasts a content-free "orders changed" ping to the ops-orders channel so a cookie-gated console can go live without a Supabase session.';

drop trigger if exists ops_orders_signal on public.orders;
create trigger ops_orders_signal
  after insert or update or delete on public.orders
  for each statement
  execute function public.signal_ops_order_change();

drop trigger if exists ops_order_status_signal on public.order_status_history;
create trigger ops_order_status_signal
  after insert on public.order_status_history
  for each statement
  execute function public.signal_ops_order_change();
