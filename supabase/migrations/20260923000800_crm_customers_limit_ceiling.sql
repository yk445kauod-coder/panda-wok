-- Panda Wok :: raise the crm_customers page-size ceiling
--
-- The function clamped `p_limit` to 200. Every caller that paginates now walks
-- the list with an explicit limit, and the admin users page needs more than the
-- old ceiling to reach the tail of a large customer book; the clamp would have
-- pinned it at 200 rows forever. 1000 keeps a single page bounded while leaving
-- headroom, and the offset remains the paging mechanism.

begin;

create or replace function public.crm_customers(
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  email text,
  created_at timestamptz,
  last_seen_at timestamptz,
  last_order_at timestamptz,
  order_count bigint,
  lifetime_value numeric,
  avg_order_value numeric,
  days_since_last_order int,
  points_balance int,
  tier loyalty_tier,
  favorite_items jsonb,
  is_blocked boolean,
  marketing_opt_in boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.phone,
    p.email,
    p.created_at,
    p.last_seen_at,
    o.last_order_at,
    coalesce(o.order_count, 0),
    coalesce(o.lifetime_value, 0),
    case when coalesce(o.order_count, 0) > 0
      then round(coalesce(o.lifetime_value, 0) / o.order_count, 2) else 0 end,
    case when o.last_order_at is null then null
      else extract(day from now() - o.last_order_at)::int end,
    coalesce(la.points_balance, 0),
    coalesce(la.tier, 'bronze'),
    coalesce(fav.items, '[]'::jsonb),
    p.is_blocked,
    p.marketing_opt_in
  from profiles p
  left join (
    select
      ord.user_id,
      max(ord.created_at) as last_order_at,
      count(*) filter (where ord.status not in ('canceled', 'rejected', 'failed')) as order_count,
      sum(ord.total) filter (where ord.status = 'finished') as lifetime_value
    from orders ord
    group by ord.user_id
  ) o on o.user_id = p.id
  left join loyalty_accounts la on la.user_id = p.id
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
  order by o.last_order_at desc nulls last, p.created_at desc
  limit greatest(1, least(p_limit, 1000)) offset greatest(0, p_offset);
$$;

revoke all on function public.crm_customers(text, int, int)
  from public, anon, authenticated;

commit;
