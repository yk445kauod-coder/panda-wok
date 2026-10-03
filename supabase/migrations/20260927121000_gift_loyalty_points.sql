-- Panda Wok :: loyalty gifting RPC for the ops agent
--
-- The ops agent may only *gift* points after a human approves the action (see
-- 20260927120000_ops_agent.sql). Gifting needs a privileged, audited path:
-- loyalty_transactions is RLS-protected and `loyalty_accounts` is only readable by
-- its owner, so the agent cannot write either directly.
--
-- This function is the single write path. It is service-role/admin only, it
-- writes a ledger row per recipient, updates the balance, and recomputes the tier
-- from lifetime points using the same thresholds as award_loyalty_on_finish.

begin;

create or replace function public.gift_loyalty_points(
  p_user_ids uuid[],
  p_points int,
  p_reason text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_count int := 0;
  v_silver numeric;
  v_gold numeric;
  v_platinum numeric;
  v_lifetime int;
  v_tier loyalty_tier;
begin
  if not (public.can_agent() or current_user in ('postgres', 'service_role')) then
    raise exception 'Not authorised to gift loyalty points' using errcode = '42501';
  end if;

  if p_points is null or p_points <= 0 then
    raise exception 'Points must be a positive number' using errcode = '22023';
  end if;
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    raise exception 'At least one recipient is required' using errcode = '22023';
  end if;

  v_silver := public.setting_numeric('loyalty.tier.silver', 500);
  v_gold := public.setting_numeric('loyalty.tier.gold', 2000);
  v_platinum := public.setting_numeric('loyalty.tier.platinum', 5000);

  foreach v_user in array p_user_ids loop
    insert into public.loyalty_accounts (user_id) values (v_user) on conflict do nothing;

    insert into public.loyalty_transactions (user_id, type, points, reason, created_by)
    values (v_user, 'bonus', p_points, coalesce(p_reason, 'Ops agent gift'), (select auth.uid()));

    update public.loyalty_accounts
       set points_balance = points_balance + p_points,
           lifetime_points = lifetime_points + p_points
     where user_id = v_user;

    select lifetime_points into v_lifetime from public.loyalty_accounts where user_id = v_user;
    v_tier := case
      when v_lifetime >= v_platinum then 'platinum'::loyalty_tier
      when v_lifetime >= v_gold then 'gold'::loyalty_tier
      when v_lifetime >= v_silver then 'silver'::loyalty_tier
      else 'bronze'::loyalty_tier
    end;
    update public.loyalty_accounts set tier = v_tier where user_id = v_user;

    insert into public.activity_logs (user_id, event, entity, entity_id, metadata)
    values (v_user, 'LOYALTY_GIFTED', 'loyalty_accounts', v_user::text,
            jsonb_build_object('points', p_points, 'reason', p_reason, 'tier', v_tier));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.gift_loyalty_points(uuid[], int, text) from public, anon;
grant execute on function public.gift_loyalty_points(uuid[], int, text) to authenticated;

commit;
