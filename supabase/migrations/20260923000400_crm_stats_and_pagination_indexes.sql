-- Panda Wok :: CRM aggregate stats + pagination indexes
--
-- Two problems this fixes:
--
-- 1. The CRM dashboard derived "lifetime value", "repeat customers" and
--    "at risk" by summing the 100 rows the list page happened to fetch. Those
--    numbers silently changed with the page size and were wrong for any
--    restaurant with more than 100 customers. `crm_stats()` computes them over
--    the whole book in one round trip.
--
-- 2. Every admin list sorts by created_at descending and pages with offset;
--    none of the ordering columns were indexed. The indexes below cover the
--    exact (tenant, order-by) shape those queries use.

begin;

create or replace function public.crm_stats()
returns table (
  customer_count bigint,
  lifetime_value numeric,
  repeat_customers bigint,
  at_risk_customers bigint,
  blocked_customers bigint,
  marketing_opt_in bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with per_customer as (
    select
      p.id,
      coalesce(sum(ord.total) filter (where ord.status = 'finished'), 0) as lifetime_value,
      count(ord.id) filter (
        where ord.status not in ('canceled', 'rejected', 'failed')
      ) as order_count,
      max(ord.created_at) filter (
        where ord.status not in ('canceled', 'rejected', 'failed')
      ) as last_order_at
    from profiles p
    left join orders ord on ord.user_id = p.id
    group by p.id
  )
  select
    count(*)::bigint,
    coalesce(sum(lifetime_value), 0),
    count(*) filter (where order_count >= 3)::bigint,
    count(*) filter (
      where order_count > 0
        and last_order_at is not null
        and last_order_at < now() - interval '30 days'
    )::bigint,
    (select count(*) from profiles where is_blocked)::bigint,
    (select count(*) from profiles where marketing_opt_in)::bigint
  from per_customer;
$$;

revoke all on function public.crm_stats() from public, anon, authenticated;

-- Total count for a filtered feedback list, used by the new pagination.
create or replace function public.feedback_count(
  p_status feedback_status default null,
  p_category feedback_category default null,
  p_search text default null
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from feedback f
  where (p_status is null or f.status = p_status)
    and (p_category is null or f.category = p_category)
    and (p_search is null or p_search = '' or f.message ilike '%' || p_search || '%');
$$;

revoke all on function public.feedback_count(feedback_status, feedback_category, text)
  from public, anon, authenticated;

-- Ordering indexes that the new offset pagination actually uses. The bare
-- created_at indexes already exist for orders/feedback, so only the tenancy
-- composite and the activity feed are added here.
create index if not exists orders_restaurant_created_at_idx
  on public.orders (restaurant_id, created_at desc);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);

commit;
