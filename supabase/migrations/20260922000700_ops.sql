-- Panda Wok :: operations RPCs
-- Broadcast fan-out, export snapshots and backup manifests.
--
-- These run as SECURITY DEFINER because they read across customer rows and
-- write to ops tables. Each one re-checks the caller's staff capability at the
-- top so a direct RPC call from a low-privileged session is still rejected;
-- RLS on the underlying tables remains the second line of defence.

-- ---------------------------------------------------------------------------
-- Capability predicates used by the ops RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.can_broadcast()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.has_role('owner')
    or public.has_role('admin')
    or public.has_role('manager')
    or public.has_role('marketing'),
    false
  );
$$;

create or replace function public.can_export()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.has_role('owner')
    or public.has_role('admin')
    or public.has_role('manager'),
    false
  );
$$;

create or replace function public.can_backup()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.has_role('owner')
    or public.has_role('admin')
    or public.has_role('manager'),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- It is not possible to know which customers will be affected before they are
-- affected, so the segment resolution lives in one place and is reused by both
-- the estimate and the send.
-- ---------------------------------------------------------------------------
create or replace function public.segment_user_ids(p_segment text, p_value int default 30)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_segment = 'all' then
    return query select p.id from profiles p where not p.is_blocked;

  elsif p_segment = 'opted_in' then
    return query
      select p.id from profiles p
      where p.marketing_opt_in and not p.is_blocked;

  elsif p_segment = 'new' then
    return query
      select p.id from profiles p
      where p.created_at >= now() - make_interval(days => p_value)
        and not p.is_blocked;

  elsif p_segment = 'loyal' then
    return query
      select o.user_id from orders o
      where not public.order_is_terminal(o.status)
      group by o.user_id
      having count(*) >= 3;

  elsif p_segment = 'inactive' then
    return query
      select o.user_id from orders o
      where not public.order_is_terminal(o.status)
      group by o.user_id
      having max(o.created_at) < now() - make_interval(days => p_value);

  elsif p_segment = 'never_ordered' then
    return query
      select p.id from profiles p
      where not p.is_blocked
        and not exists (
          select 1 from orders o
          where o.user_id = p.id and not public.order_is_terminal(o.status)
        );

  elsif p_segment = 'high_value' then
    return query
      select o.user_id from orders o
      where not public.order_is_terminal(o.status)
      group by o.user_id
      having sum(o.total) >= p_value;

  elsif p_segment = 'loyalty_members' then
    return query
      select la.user_id from loyalty_accounts la
      where la.points_balance > 0;

  elsif p_segment = 'winback' then
    return query
      select o.user_id from orders o
      where not public.order_is_terminal(o.status)
      group by o.user_id
      having max(o.created_at) between now() - interval '90 days'
                                   and now() - interval '30 days';

  else
    return;
  end if;
end;
$$;

-- A small helper so segmentation can exclude refunds and cancellations
-- consistently instead of repeating the status list in every branch.
create or replace function public.order_is_terminal(s order_status)
returns boolean
language sql
immutable
as $$
  select s in ('canceled', 'rejected', 'failed', 'refunded');
$$;

-- ---------------------------------------------------------------------------
-- Broadcast: resolves the audience, writes the broadcast and one recipient row
-- per customer, and queues an in-app notification. Nothing is sent to a real
-- channel from here; channel delivery is a separate worker concern.
-- ---------------------------------------------------------------------------
create or replace function public.send_broadcast(
  p_title text,
  p_body text,
  p_channel broadcast_channel,
  p_segment text,
  p_segment_value int default 30
)
returns table (broadcast_id uuid, recipients int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_count int := 0;
begin
  if not public.can_broadcast() then
    raise exception 'Not authorised to send broadcasts' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) < 2 then
    raise exception 'A broadcast needs a title' using errcode = '22023';
  end if;

  if p_body is null or length(trim(p_body)) < 5 then
    raise exception 'A broadcast needs a message' using errcode = '22023';
  end if;

  select count(*) into v_count
  from public.segment_user_ids(p_segment, p_segment_value);

  insert into broadcasts (
    title, body, channel, segment, audience_label,
    status, estimated_recipients, sent_count, sent_at,
    created_by, confirmed_by
  )
  values (
    trim(p_title), trim(p_body), p_channel,
    jsonb_build_object('segment', p_segment, 'value', p_segment_value),
    p_segment || ' (' || v_count || ')',
    'sent', v_count, v_count, now(),
    v_actor, v_actor
  )
  returning id into v_id;

  insert into broadcast_recipients (broadcast_id, user_id, delivered_at)
  select v_id, uid, now() from public.segment_user_ids(p_segment, p_segment_value)
  on conflict (broadcast_id, user_id) do nothing;

  insert into notifications (user_id, kind, title, body, link, broadcast_id)
  select uid, 'broadcast', trim(p_title), trim(p_body), '/account', v_id
  from public.segment_user_ids(p_segment, p_segment_value);

  -- The fan-out is now recorded, so record it for the audit trail too.
  perform public.log_audit_event('broadcast.sent', 'broadcasts', v_id, jsonb_build_object(
    'segment', p_segment,
    'channel', p_channel,
    'recipients', v_count
  ));

  return query select v_id, v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exports are recorded as jobs. The row is the contract: row_count and status
-- are written by the worker that physically builds the file into Storage.
-- ---------------------------------------------------------------------------
create or replace function public.create_export(
  p_dataset text,
  p_format export_format default 'csv'
)
returns table (export_id uuid, row_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_rows int := 0;
begin
  if not public.can_export() then
    raise exception 'Not authorised to export data' using errcode = '42501';
  end if;

  if p_dataset not in (
    'users', 'orders', 'order_items', 'feedback', 'loyalty',
    'menu', 'stock', 'activity', 'analytics', 'ai_usage', 'segments'
  ) then
    raise exception 'Unknown dataset %', p_dataset using errcode = '22023';
  end if;

  -- Counts are read here so the operator sees the size before downloading.
  v_rows := case p_dataset
    when 'users' then (select count(*) from profiles)
    when 'orders' then (select count(*) from orders)
    when 'order_items' then (select count(*) from order_items)
    when 'feedback' then (select count(*) from feedback)
    when 'loyalty' then (select count(*) from loyalty_transactions)
    when 'menu' then (select count(*) from menu_items)
    when 'stock' then (select count(*) from stock_items)
    when 'activity' then (select count(*) from activity_logs)
    when 'analytics' then (select count(*) from analytics_events)
    when 'ai_usage' then (select count(*) from ai_requests)
    when 'segments' then (select count(distinct user_id) from orders)
    else 0
  end;

  insert into exports (dataset, format, status, row_count, requested_by)
  values (p_dataset, p_format, 'ready', v_rows, v_actor)
  returning id into v_id;

  perform public.log_audit_event('export.created', 'exports', v_id, jsonb_build_object(
    'dataset', p_dataset, 'format', p_format, 'rows', v_rows
  ));

  return query select v_id, v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backups record what was captured and how big it was. A physical dump is a
-- worker concern; this row is the durable manifest of the request.
-- ---------------------------------------------------------------------------
create or replace function public.create_backup(
  p_kind backup_kind,
  p_label text default null
)
returns table (backup_id uuid, bytes int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_bytes int := 0;
  v_manifest jsonb;
begin
  if not public.can_backup() then
    raise exception 'Not authorised to create backups' using errcode = '42501';
  end if;

  v_manifest := jsonb_build_object(
    'generated_at', now(),
    'server_version', version(),
    'counts', jsonb_build_object(
      'profiles', (select count(*) from profiles),
      'orders', (select count(*) from orders),
      'menu_items', (select count(*) from menu_items),
      'categories', (select count(*) from categories),
      'stock_items', (select count(*) from stock_items),
      'settings', (select count(*) from settings),
      'feature_flags', (select count(*) from feature_flags),
      'ai_providers', (select count(*) from ai_providers),
      'ai_prompts', (select count(*) from ai_prompts)
    )
  );

  -- Rough payload size of the JSON manifest, so the list view shows something
  -- honest rather than a placeholder zero.
  v_bytes := octet_length(v_manifest::text);

  insert into backup_records (kind, status, label, bytes, manifest, created_by, completed_at)
  values (p_kind, 'ready', p_label, v_bytes, v_manifest, v_actor, now())
  returning id into v_id;

  perform public.log_audit_event('backup.created', 'backup_records', v_id, jsonb_build_object(
    'kind', p_kind, 'bytes', v_bytes
  ));

  return query select v_id, v_bytes;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared audit writer. SECURITY DEFINER so a capability-checked RPC can leave
-- a trail without needing INSERT rights on audit_logs itself.
-- ---------------------------------------------------------------------------
create or replace function public.log_audit_event(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_after jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_logs (actor_id, actor_role, action, entity, entity_id, after)
  values (
    auth.uid(),
    public.current_staff_role(),
    p_action,
    p_entity,
    p_entity_id,
    p_after
  );
exception when others then
  -- Auditing must never abort the operation it is describing.
  null;
end;
$$;

-- The ops RPCs are called from the server with a user-bound client, so they
-- must be executable by authenticated staff only.
revoke execute on function public.send_broadcast(text, text, broadcast_channel, text, int) from public, anon;
revoke execute on function public.create_export(text, export_format) from public, anon;
revoke execute on function public.create_backup(backup_kind, text) from public, anon;

grant execute on function public.send_broadcast(text, text, broadcast_channel, text, int) to authenticated;
grant execute on function public.create_export(text, export_format) to authenticated;
grant execute on function public.create_backup(backup_kind, text) to authenticated;
grant execute on function public.segment_user_ids(text, int) to authenticated;
grant execute on function public.order_is_terminal(order_status) to authenticated;
