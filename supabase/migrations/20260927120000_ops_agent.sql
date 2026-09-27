-- Panda Wok :: owner-facing ops agent
--
-- The agent observes the business on a schedule, writes a report, and *proposes*
-- actions. Nothing that touches money, customers or the public site is applied
-- without explicit approval, so a misconfigured model can never broadcast to
-- customers or mutate the menu on its own.
--
-- Three tables:
--   ops_agent_settings  single-row cadence config (owner-editable)
--   ops_agent_runs      one row per execution, with its report and timings
--   ops_agent_actions   the approval queue (and the applied-action ledger)
--
-- Enforcement matches the rest of the console: `can_agent()` is owner/admin,
-- and every policy funnels through it. The server also runs under the service
-- role for the scheduled runs, so `can_agent()` is the app-side gate rather than
-- the only gate.

begin;

-- ---------------------------------------------------------------- capability

create or replace function public.can_agent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'admin') from public.staff where user_id = (select auth.uid()) limit 1),
    false
  );
$$;

revoke execute on function public.can_agent() from public, anon;
grant execute on function public.can_agent() to authenticated;

-- ---------------------------------------------------------------- settings

create table if not exists public.ops_agent_settings (
  id boolean primary key default true check (id),
  is_enabled boolean not null default true,
  -- Cadence in hours for the business report. 168 = weekly, 24 = daily.
  report_interval_hours int not null default 24 check (report_interval_hours between 1 and 720),
  -- Weekly backup cadence is separate so backups can run more often than reports.
  backup_interval_hours int not null default 168 check (backup_interval_hours between 1 and 720),
  -- When false the agent may only observe + report, never propose actions.
  proposals_enabled boolean not null default true,
  last_report_at timestamptz,
  last_backup_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.ops_agent_settings (id) values (true) on conflict (id) do nothing;

alter table public.ops_agent_settings enable row level security;

drop policy if exists ops_agent_settings_staff_read on public.ops_agent_settings;
create policy ops_agent_settings_staff_read on public.ops_agent_settings
  for select to authenticated using (public.can_agent());

drop policy if exists ops_agent_settings_staff_write on public.ops_agent_settings;
create policy ops_agent_settings_staff_write on public.ops_agent_settings
  for all to authenticated using (public.can_agent()) with check (public.can_agent());

-- ---------------------------------------------------------------- runs

create table if not exists public.ops_agent_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('report', 'backup', 'proposal', 'manual')),
  trigger text not null default 'schedule' check (trigger in ('schedule', 'manual', 'cron')),
  status text not null default 'running' check (status in ('running', 'ready', 'failed')),
  headline text,
  summary text,
  report jsonb not null default '{}'::jsonb,
  actions_proposed int not null default 0,
  provider text,
  model text,
  error text,
  duration_ms int,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ops_agent_runs_started_idx on public.ops_agent_runs (kind, started_at desc);

alter table public.ops_agent_runs enable row level security;

drop policy if exists ops_agent_runs_staff_read on public.ops_agent_runs;
create policy ops_agent_runs_staff_read on public.ops_agent_runs
  for select to authenticated using (public.can_agent());

drop policy if exists ops_agent_runs_staff_write on public.ops_agent_runs;
create policy ops_agent_runs_staff_write on public.ops_agent_runs
  for all to authenticated using (public.can_agent()) with check (public.can_agent());

-- ---------------------------------------------------------------- actions

create table if not exists public.ops_agent_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.ops_agent_runs (id) on delete set null,
  -- What the agent wants to do. `newsletter` reuses the existing broadcast
  -- plumbing; the rest are internal notifications or flags the owner acts on.
  kind text not null check (kind in (
    'newsletter', 'reengage', 'restock', 'publish_insights',
    'price_review', 'menu_gap', 'loyalty_tuning', 'custom'
  )),
  title text not null,
  rationale text,
  -- The exact parameters an approval would apply. Stored, never executed blind.
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'rejected', 'applied', 'failed')),
  requires_approval boolean not null default true,
  requested_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  applied_at timestamptz,
  applied_ref text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ops_agent_actions_status_idx on public.ops_agent_actions (status, created_at desc);

alter table public.ops_agent_actions enable row level security;

drop policy if exists ops_agent_actions_staff_read on public.ops_agent_actions;
create policy ops_agent_actions_staff_read on public.ops_agent_actions
  for select to authenticated using (public.can_agent());

drop policy if exists ops_agent_actions_staff_write on public.ops_agent_actions;
create policy ops_agent_actions_staff_write on public.ops_agent_actions
  for all to authenticated using (public.can_agent()) with check (public.can_agent());

-- ---------------------------------------------------------------- RPCs

/**
 * Records an agent run. Called at the end of every report/backup so the console
 * has an audit trail and the cadence check has a timestamp to compare against.
 */
create or replace function public.record_agent_run(
  p_kind text,
  p_trigger text,
  p_status text,
  p_headline text,
  p_summary text,
  p_report jsonb,
  p_actions_proposed int,
  p_provider text,
  p_model text,
  p_error text,
  p_duration_ms int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.can_agent() or current_user in ('postgres', 'service_role')) then
    raise exception 'Not authorised to record an agent run' using errcode = '42501';
  end if;

  insert into public.ops_agent_runs (
    kind, trigger, status, headline, summary, report, actions_proposed,
    provider, model, error, duration_ms, finished_at
  ) values (
    p_kind, p_trigger, p_status, p_headline, p_summary,
    coalesce(p_report, '{}'::jsonb), greatest(coalesce(p_actions_proposed, 0), 0),
    p_provider, p_model, p_error, p_duration_ms, now()
  )
  returning id into v_id;

  if p_kind = 'report' and p_status = 'ready' then
    update public.ops_agent_settings set last_report_at = now(), updated_at = now() where id;
  elsif p_kind = 'backup' and p_status = 'ready' then
    update public.ops_agent_settings set last_backup_at = now(), updated_at = now() where id;
  end if;

  return v_id;
end;
$$;

/**
 * Queues an action. Always lands as `proposed`; only the approve RPC moves it
 * forward. This is the approval gate in code: there is no path that inserts an
 * action already `applied`.
 */
create or replace function public.enqueue_ops_action(
  p_run_id uuid,
  p_kind text,
  p_title text,
  p_rationale text,
  p_payload jsonb,
  p_requires_approval boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.can_agent() or current_user in ('postgres', 'service_role')) then
    raise exception 'Not authorised to enqueue an agent action' using errcode = '42501';
  end if;

  insert into public.ops_agent_actions (
    run_id, kind, title, rationale, payload, status, requires_approval, requested_by
  ) values (
    p_run_id, p_kind, p_title, p_rationale, coalesce(p_payload, '{}'::jsonb),
    'proposed', coalesce(p_requires_approval, true), (select auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

/** Marks a proposed action approved. Does not apply it; the server applies. */
create or replace function public.approve_ops_action(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not (public.can_agent() or current_user in ('postgres', 'service_role')) then
    raise exception 'Not authorised to approve an agent action' using errcode = '42501';
  end if;

  update public.ops_agent_actions
  set status = 'approved', decided_by = v_actor, decided_at = now(), decision_note = p_note
  where id = p_id and status = 'proposed';

  if not found then
    raise exception 'Action % is not awaiting approval', p_id using errcode = '22023';
  end if;
end;
$$;

create or replace function public.reject_ops_action(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not (public.can_agent() or current_user in ('postgres', 'service_role')) then
    raise exception 'Not authorised to reject an agent action' using errcode = '42501';
  end if;

  update public.ops_agent_actions
  set status = 'rejected', decided_by = v_actor, decided_at = now(), decision_note = p_note
  where id = p_id and status = 'proposed';

  if not found then
    raise exception 'Action % is not awaiting approval', p_id using errcode = '22023';
  end if;
end;
$$;

/** True when the cadence has elapsed, so the cron handler can cheaply no-op. */
create or replace function public.ops_agent_due(p_kind text default 'report')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_kind
    when 'backup' then coalesce(
      (select last_backup_at is null
          or last_backup_at < now() - make_interval(hours => backup_interval_hours)
       from public.ops_agent_settings where id),
      false)
    else coalesce(
      (select is_enabled and (
         last_report_at is null
         or last_report_at < now() - make_interval(hours => report_interval_hours)
       )
       from public.ops_agent_settings where id),
      false)
  end;
$$;

revoke execute on function public.record_agent_run(text,text,text,text,text,jsonb,int,text,text,text,int) from public, anon;
revoke execute on function public.enqueue_ops_action(uuid,text,text,text,jsonb,boolean) from public, anon;
revoke execute on function public.approve_ops_action(uuid,text) from public, anon;
revoke execute on function public.reject_ops_action(uuid,text) from public, anon;
revoke execute on function public.ops_agent_due(text) from public, anon;

grant execute on function public.record_agent_run(text,text,text,text,text,jsonb,int,text,text,text,int) to authenticated;
grant execute on function public.enqueue_ops_action(uuid,text,text,text,jsonb,boolean) to authenticated;
grant execute on function public.approve_ops_action(uuid,text) to authenticated;
grant execute on function public.reject_ops_action(uuid,text) to authenticated;
grant execute on function public.ops_agent_due(text) to authenticated;

commit;
