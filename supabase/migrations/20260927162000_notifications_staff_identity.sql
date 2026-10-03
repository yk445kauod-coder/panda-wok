-- The staff bell reads through a passcode-gated console, not a Supabase
-- session, so `auth.uid()` is null there and every `list_my_notifications` /
-- `count_unread_notifications` / mark-read call came back empty or zero. The
-- staff feed looked permanently clean.
--
-- These RPCs resolve the caller explicitly against the staff table. Identity is
-- passed in by the *server*, never by the browser: the service-role client is
-- the only caller, so `p_user_id` is whatever the ops session's `actorId`
-- resolved to (its own auth user, or the founding owner for the bare passcode).
-- `authenticated` keeps its grant so a signed-in staff member's own bell still
-- works; the explicit id is ignored in that case in favour of `auth.uid()`.

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
  with me as (
    select coalesce(auth.uid(), case when current_user = 'service_role' then p_user_id end) as id
  )
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
  with me as (
    select coalesce(auth.uid(), case when current_user = 'service_role' then p_user_id end) as id
  )
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
  with me as (
    select coalesce(auth.uid(), case when current_user = 'service_role' then p_user_id end) as id
  )
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
  with me as (
    select coalesce(auth.uid(), case when current_user = 'service_role' then p_user_id end) as id
  )
  update public.notifications n
  set read_at = now()
  from me
  where n.user_id = me.id and n.audience = p_audience and n.read_at is null;
$$;

-- The old two-/three-arg signatures are superseded; drop them so there is one
-- unambiguous function per call name.
drop function if exists public.list_my_notifications(text, integer, boolean);
drop function if exists public.count_unread_notifications(text);
drop function if exists public.mark_notification_read(bigint);
drop function if exists public.mark_all_notifications_read(text);

revoke all on function public.list_my_notifications(text, integer, boolean, uuid) from public;
revoke all on function public.count_unread_notifications(text, uuid) from public;
revoke all on function public.mark_notification_read(bigint, uuid) from public;
revoke all on function public.mark_all_notifications_read(text, uuid) from public;

grant execute on function public.list_my_notifications(text, integer, boolean, uuid) to authenticated, service_role;
grant execute on function public.count_unread_notifications(text, uuid) to authenticated, service_role;
grant execute on function public.mark_notification_read(bigint, uuid) to authenticated, service_role;
grant execute on function public.mark_all_notifications_read(text, uuid) to authenticated, service_role;
