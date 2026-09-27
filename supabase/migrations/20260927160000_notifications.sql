-- Notifications for both apps.
--
-- The `notifications` table existed since the CRM migration but had two gaps:
-- nothing read it (no component queried it anywhere), and it had no way to
-- distinguish a customer's notification from a staff member's. The ops agent
-- wrote `kind: "ops_agent"` rows to owners and `send_broadcast` wrote customer
-- rows to the same table, so a reader could not tell the two audiences apart.
--
-- This adds an explicit audience + category, the read/unread RPCs the bell UI
-- calls, and a staff fan-out helper. The read RPCs are SECURITY DEFINER so the
-- server can list and clear a member's own rows without re-deriving the caller
-- on every page render; each one still filters by auth.uid().

alter table public.notifications
  add column if not exists audience text not null default 'customer',
  add column if not exists category text not null default 'system';

-- Existing rows are customer-facing by construction (broadcasts and ops-agent
-- owner alerts predate this split). Rows whose kind is an ops-agent alert were
-- written for staff, so classify those correctly rather than leaving them as
-- 'customer'.
update public.notifications set audience = 'staff'
  where kind in ('ops_agent', 'agent_action', 'agent_report');
update public.notifications set category = 'agent'
  where kind in ('ops_agent', 'agent_action', 'agent_report');

alter table public.notifications
  drop constraint if exists notifications_audience_check;
alter table public.notifications
  add constraint notifications_audience_check
  check (audience in ('customer', 'staff'));

-- The bell always asks "my unread, newest first", so cover exactly that.
create index if not exists notifications_unread_idx
  on public.notifications (user_id, audience, created_at desc)
  where read_at is null;
create index if not exists notifications_audience_idx
  on public.notifications (audience, created_at desc);

-- ------------------------------------------------------------------ writers

/**
 * Writes one notification. SECURITY DEFINER so server actions and RPCs can
 * notify a user without holding a per-row insert policy for them.
 */
create or replace function public.create_notification(
  p_user_id uuid,
  p_audience text,
  p_category text,
  p_kind text,
  p_title text,
  p_body text default null,
  p_link text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.notifications (user_id, audience, category, kind, title, body, link)
  values (p_user_id, p_audience, p_category, p_kind, p_title, p_body, p_link)
  returning id into v_id;
  return v_id;
end;
$$;

/**
 * Fans a notification out to every staff member holding a role, optionally only
 * those with a capability. Used by the ops agent and by chat when a customer
 * writes in, so the owner sees it without polling the inbox.
 */
create or replace function public.notify_staff(
  p_roles text[],
  p_category text,
  p_kind text,
  p_title text,
  p_body text default null,
  p_link text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.notifications (user_id, audience, category, kind, title, body, link)
  select distinct s.user_id, 'staff', p_category, p_kind, p_title, p_body, p_link
  from public.staff s
  where s.role = any (p_roles)
    and s.is_active
    and s.user_id is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ------------------------------------------------------------------ readers

create or replace function public.list_my_notifications(
  p_audience text default 'customer',
  p_limit integer default 20,
  p_unread_only boolean default false
) returns table (
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
  select n.id, n.category, n.kind, n.title, n.body, n.link, n.read_at, n.created_at
  from public.notifications n
  where n.user_id = auth.uid()
    and n.audience = p_audience
    and (not p_unread_only or n.read_at is null)
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.count_unread_notifications(
  p_audience text default 'customer'
) returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.notifications n
  where n.user_id = auth.uid()
    and n.audience = p_audience
    and n.read_at is null;
$$;

create or replace function public.mark_notification_read(p_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = now()
  where id = p_id and user_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_all_notifications_read(p_audience text default 'customer')
returns integer
language sql
security definer
set search_path = public
as $$
  with cleared as (
    update public.notifications
    set read_at = now()
    where user_id = auth.uid() and audience = p_audience and read_at is null
    returning 1
  )
  select count(*)::integer from cleared;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function public.create_notification(uuid, text, text, text, text, text, text) from public;
revoke all on function public.notify_staff(text[], text, text, text, text, text) from public;
revoke all on function public.list_my_notifications(text, integer, boolean) from public;
revoke all on function public.count_unread_notifications(text) from public;
revoke all on function public.mark_notification_read(bigint) from public;
revoke all on function public.mark_all_notifications_read(text) from public;

-- Writers are server-only (service role). Readers run as the signed-in member.
grant execute on function public.create_notification(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.notify_staff(text[], text, text, text, text, text) to service_role;
grant execute on function public.list_my_notifications(text, integer, boolean) to authenticated;
grant execute on function public.count_unread_notifications(text) to authenticated;
grant execute on function public.mark_notification_read(bigint) to authenticated;
grant execute on function public.mark_all_notifications_read(text) to authenticated;
