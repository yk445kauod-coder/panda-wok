-- Panda Wok :: filtered customer head-count
--
-- `/admin/users` listed at most 200 customers with no pagination, so any staff
-- account beyond that window was invisible and unmanageable. The page now pages
-- through `crm_customers` with a limit/offset and needs the matching total under
-- the same search filter.

begin;

create or replace function public.crm_customer_count(p_search text default null)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from profiles p
  where p_search is null
     or p_search = ''
     or p.full_name ilike '%' || p_search || '%'
     or p.phone ilike '%' || p_search || '%'
     or p.email ilike '%' || p_search || '%';
$$;

revoke all on function public.crm_customer_count(text) from public, anon, authenticated;

commit;
