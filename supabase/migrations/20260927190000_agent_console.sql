-- Panda Wok :: admin ↔ AI agent chat, MCP servers and automations
--
-- Three additions, all owner/staff scoped through the existing `can_agent()`
-- gate (owner/admin), except the agent chat which any unlocked staff member may
-- use within their own capabilities:
--
--   agent_threads / agent_messages   one conversation with the ops agent
--   mcp_servers                      external MCP endpoints the agent can call
--   agent_automations                user-defined scheduled jobs (daily/weekly/monthly)
--
-- Nothing here executes by itself: `agent_automations` rows are read by the
-- existing pg_cron tick, and MCP calls run only from an agent turn whose actor
-- holds the capability the tool declares.

begin;

-- ---------------------------------------------------------------- agent chat

create table if not exists public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  -- The gate actor id (auth.users id, or null for a passcode-only owner).
  owner_id uuid,
  owner_label text,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_threads_owner_idx on public.agent_threads (owner_id, updated_at desc);

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.agent_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  body text not null default '',
  -- Tool calls the assistant made this turn, and their results, as structured
  -- data so the UI can render an activity log rather than a wall of text.
  steps jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists agent_messages_thread_idx on public.agent_messages (thread_id, created_at);

alter table public.agent_threads enable row level security;
alter table public.agent_messages enable row level security;

-- Staff chat with the agent is a working tool, not an owner-only surface, so it
-- is gated on `is_staff()` rather than `can_agent()`. The app also scopes by
-- owner_id when an actor id exists, so one member does not read another's
-- thread; a passcode-only owner (null id) sees the shared owner threads.
drop policy if exists agent_threads_staff_read on public.agent_threads;
create policy agent_threads_staff_read on public.agent_threads
  for select to authenticated
  using (
    public.is_staff()
    and (owner_id is null or owner_id = (select auth.uid()))
  );

drop policy if exists agent_threads_staff_write on public.agent_threads;
create policy agent_threads_staff_write on public.agent_threads
  for all to authenticated
  using (public.is_staff() and (owner_id is null or owner_id = (select auth.uid())))
  with check (public.is_staff());

drop policy if exists agent_messages_staff_read on public.agent_messages;
create policy agent_messages_staff_read on public.agent_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.agent_threads t
      where t.id = thread_id
        and public.is_staff()
        and (t.owner_id is null or t.owner_id = (select auth.uid()))
    )
  );

drop policy if exists agent_messages_staff_write on public.agent_messages;
create policy agent_messages_staff_write on public.agent_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.agent_threads t
      where t.id = thread_id
        and public.is_staff()
        and (t.owner_id is null or t.owner_id = (select auth.uid()))
    )
  )
  with check (public.is_staff());

-- ---------------------------------------------------------------- MCP servers

create table if not exists public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- The JSON-RPC endpoint, e.g. https://mcp.example.com/mcp
  url text not null,
  -- Transport: streamable HTTP is the current default; SSE is kept for older
  -- servers; stdio is not applicable to a serverless deployment so it is absent.
  transport text not null default 'http' check (transport in ('http', 'sse')),
  -- Auth header name + the Vault secret name holding its value. The value is
  -- never stored here, matching ai_providers.secret_ref.
  auth_header text default 'authorization',
  secret_ref text,
  -- Tool allow-list. Null/empty means "offer every tool the server advertises".
  allowed_tools text[],
  is_enabled boolean not null default true,
  last_probed_at timestamptz,
  last_probe_ok boolean,
  last_probe_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mcp_servers enable row level security;

drop policy if exists mcp_servers_staff_read on public.mcp_servers;
create policy mcp_servers_staff_read on public.mcp_servers
  for select to authenticated using (public.can_agent());

drop policy if exists mcp_servers_staff_write on public.mcp_servers;
create policy mcp_servers_staff_write on public.mcp_servers
  for all to authenticated using (public.can_agent()) with check (public.can_agent());

-- ---------------------------------------------------------------- automations

create table if not exists public.agent_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- What the automation does. `report` writes an ops run; `agent` runs a prompt
  -- through the agent loop; `export` queues a dataset export.
  kind text not null check (kind in ('report', 'agent', 'export')),
  -- The prompt for an `agent` automation, or the dataset for an `export`.
  prompt text,
  payload jsonb not null default '{}'::jsonb,
  -- Cadence. Daily/weekly/monthly, matching the owner's request, plus a free
  -- interval for anything else. The tick checks `next_run_at`.
  cadence text not null default 'daily' check (cadence in ('daily', 'weekly', 'monthly', 'interval')),
  interval_hours int,
  -- 0=Sunday … 6=Saturday, used by weekly; day-of-month used by monthly.
  weekday int check (weekday between 0 and 6),
  day_of_month int check (day_of_month between 1 and 28),
  -- Local hour (0-23) the job should fire at.
  at_hour int not null default 8 check (at_hour between 0 and 23),
  is_enabled boolean not null default true,
  notify boolean not null default true,
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_automations_due_idx
  on public.agent_automations (is_enabled, next_run_at);

alter table public.agent_automations enable row level security;

drop policy if exists agent_automations_staff_read on public.agent_automations;
create policy agent_automations_staff_read on public.agent_automations
  for select to authenticated using (public.can_agent());

drop policy if exists agent_automations_staff_write on public.agent_automations;
create policy agent_automations_staff_write on public.agent_automations
  for all to authenticated using (public.can_agent()) with check (public.can_agent());

-- ---------------------------------------------------------------- schedule math

/**
 * Next fire time for an automation, computed from now. Kept in SQL so the tick
 * and any UI preview agree on the same answer.
 */
create or replace function public.agent_next_run(
  p_cadence text,
  p_interval_hours int,
  p_weekday int,
  p_day_of_month int,
  p_at_hour int,
  p_from timestamptz default now()
)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  base date := (p_from at time zone 'UTC')::date;
  target timestamptz;
  horizon int := 0;
begin
  if p_cadence = 'interval' then
    return p_from + make_interval(hours => greatest(p_interval_hours, 1));
  end if;

  -- Walk forward until we hit a day that satisfies the calendar rule, then set
  -- the hour. Bounded so a bad input cannot loop forever.
  while horizon < 400 loop
    target := ((base + horizon)::timestamp + make_interval(hours => p_at_hour)) at time zone 'UTC';
    if target > p_from then
      if p_cadence = 'daily' then
        return target;
      elsif p_cadence = 'weekly' then
        if extract(dow from target) = coalesce(p_weekday, 1) then
          return target;
        end if;
      elsif p_cadence = 'monthly' then
        if extract(day from target) = coalesce(p_day_of_month, 1) then
          return target;
        end if;
      end if;
    end if;
    horizon := horizon + 1;
  end loop;

  return p_from + interval '1 day';
end;
$$;

revoke execute on function public.agent_next_run(text, int, int, int, int, timestamptz) from public, anon;
grant execute on function public.agent_next_run(text, int, int, int, int, timestamptz) to authenticated;

/** Marks an automation run and schedules the next one. Called by the cron tick. */
create or replace function public.record_automation_run(
  p_id uuid,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agent_automations
  set last_run_at = now(),
      last_status = p_status,
      last_error = p_error,
      next_run_at = public.agent_next_run(
        cadence, interval_hours, weekday, day_of_month, at_hour, now() + interval '1 minute'
      ),
      updated_at = now()
  where id = p_id;
end;
$$;

revoke execute on function public.record_automation_run(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_automation_run(uuid, text, text) to service_role;

-- Default the first run when a row is created without one.
create or replace function public.set_automation_next_run()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.next_run_at is null or new.next_run_at = now() then
    new.next_run_at := public.agent_next_run(
      new.cadence, new.interval_hours, new.weekday, new.day_of_month, new.at_hour, now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists agent_automations_schedule on public.agent_automations;
create trigger agent_automations_schedule
  before insert on public.agent_automations
  for each row execute function public.set_automation_next_run();

commit;
