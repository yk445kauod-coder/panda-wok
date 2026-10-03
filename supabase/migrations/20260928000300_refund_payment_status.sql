-- A refund must move the money state with the workflow.
--
-- `updateOrderStatusAction` set `status = 'refunded'` but left
-- `payment_status = 'paid'`, so the dashboard counted a refunded order as
-- collected revenue. Enforcing it in the same trigger that already stamps the
-- workflow timestamps keeps every writer consistent, including a direct SQL
-- update through the staff RLS policy.
create or replace function public.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;
