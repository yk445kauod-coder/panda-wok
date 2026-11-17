-- Panda Wok :: CRM customer list — server-side sort for paged reads
--
-- The CRM home is paged now (25 rows per page, `/api/admin/crm?page=N`). The
-- page used to sort in the browser, which is only correct when every row is on
-- screen; once the list is a page, a client-side sort would reorder just the 25
-- rows it was handed and read as if the whole book had been sorted.
--
-- So the order moves here, behind a `p_sort` argument the caller passes. The
-- default keeps the old behaviour (`recent` = the previous hard-coded
-- `order by last_order_at desc nulls last, created_at desc`), so existing
-- callers that pass no sort are unchanged.
--
-- Values: recent | lifetime_value | orders | at_risk. Anything else is
-- `recent`, so an unknown value cannot reach an unindexed or unsafe ordering.

drop function if exists public.crm_customers(text, integer, integer);
create or replace function public.crm_customers(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_sort text default 'recent'
)
returns table(
  user_id uuid, full_name text, phone text, email text,
  created_at timestamp with time zone, last_seen_at timestamp with time zone,
  last_order_at timestamp with time zone, order_count bigint,
  lifetime_value numeric, avg_order_value numeric, days_since_last_order integer,
  points_balance integer, tier text, favorite_items jsonb,
  is_blocked boolean, marketing_opt_in boolean
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with agg as (
    select
      ord.user_id,
      max(ord.created_at) as last_order_at,
      count(*) filter (where ord.status not in ('canceled', 'rejected', 'failed')) as order_count,
      sum(ord.total) filter (where ord.status = 'finished') as lifetime_value
    from orders ord
    group by ord.user_id
  )
  select
    p.id,
    p.full_name,
    p.phone,
    p.email,
    p.created_at,
    p.last_seen_at,
    a.last_order_at,
    coalesce(a.order_count, 0),
    coalesce(a.lifetime_value, 0),
    case when coalesce(a.order_count, 0) > 0
      then round(coalesce(a.lifetime_value, 0) / a.order_count, 2) else 0 end,
    case when a.last_order_at is null then null
      else extract(day from now() - a.last_order_at)::int end,
    0,
    'bronze',
    coalesce(fav.items, '[]'::jsonb),
    p.is_blocked,
    p.marketing_opt_in
  from profiles p
  left join agg a on a.user_id = p.id
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
  order by
    case when p_sort = 'lifetime_value' then coalesce(a.lifetime_value, 0) end desc nulls last,
    case when p_sort = 'orders' then coalesce(a.order_count, 0) end desc nulls last,
    case when p_sort = 'at_risk' then a.last_order_at end asc nulls last,
    case when p_sort not in ('lifetime_value', 'orders', 'at_risk')
      then a.last_order_at end desc nulls last,
    p.created_at desc
  limit greatest(1, least(p_limit, 1000)) offset greatest(0, p_offset);
$function$;

revoke all on function public.crm_customers(text, integer, integer, text)
  from public, anon, authenticated;
