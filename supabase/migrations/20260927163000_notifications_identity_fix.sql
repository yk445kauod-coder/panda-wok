-- Correction to 20260927162000.
--
-- That revision guarded the explicit staff id with `current_user = 'service_role'`.
-- Inside a SECURITY DEFINER function `current_user` is the *function owner*
-- (postgres), not the invoker, so the guard was always false and the RPC still
-- returned nothing for the passcode-gated console (verified: the owner has 4
-- unread staff rows, `count_unread_notifications` returned 0).
--
-- `coalesce(auth.uid(), p_user_id)` is the correct rule on its own: a caller
-- with a session is always pinned to their own uid and cannot read another
-- member's rows by passing an id, while anon has no EXECUTE grant at all, and
-- service_role is the intended server-side path that may name a member.
-- Re-declare the four RPCs without the broken guard.

create or replace function public.list_my_notifications(
  p_audience text default 'customer',
  p_limit integer default 20,
  p_unread_only boolean default false,
  p_user_id uuid default null
)
returns table (
  id bigint,
  category text,
  kind text,
  title text,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select coalesce(auth.uid(), p_user_id) as id)
  select n.id, n.category, n.kind, n.title, n.body, n.link, n.read_at, n.created_at
  from public.notifications n, me
  where n.user_id = me.id
    and n.audience = p_audience
    and (not p_unread_only or n.read_at is null)
  order by n.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.count_unread_notifications(
  p_audience text default 'customer',
  p_user_id uuid default null
)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  with me as (select coalesce(auth.uid(), p_user_id) as id)
  select count(*)::bigint
  from public.notifications n, me
  where n.user_id = me.id
    and n.audience = p_audience
    and n.read_at is null;
$$;

create or replace function public.mark_notification_read(
  p_id bigint,
  p_user_id uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  with me as (select coalesce(auth.uid(), p_user_id) as id)
  update public.notifications n
  set read_at = now()
  from me
  where n.id = p_id and n.user_id = me.id and n.read_at is null;
$$;

create or replace function public.mark_all_notifications_read(
  p_audience text default 'customer',
  p_user_id uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  with me as (select coalesce(auth.uid(), p_user_id) as id)
  update public.notifications n
  set read_at = now()
  from me
  where n.user_id = me.id and n.audience = p_audience and n.read_at is null;
$$;
