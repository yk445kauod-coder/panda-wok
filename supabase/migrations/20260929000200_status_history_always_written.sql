-- Corrective: order-status history must always be written.
--
-- `20260929000100_realtime_and_loyalty_default.sql` gated the history insert in
-- `log_order_status()` on the `loyalty` feature flag. That was wrong: the history
-- table is the audit trail *and* the realtime signal the customer's tracking page
-- subscribes to, so gating it on loyalty would silence tracking whenever loyalty
-- is off — exactly the symptom that migration set out to fix.
--
-- This restores the unconditional insert. Only points accrual and clawback remain
-- gated on the flag. The repo file for `...00100` already carries the corrected
-- body; this file exists because `...00100` had already been applied live before
-- the correction, and the two must agree.
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
