-- Scheduled ops-agent runs.
--
-- Why pg_cron and not a Worker Cron Trigger: a Worker trigger would need the app
-- Worker rebuilt and a `scheduled` handler wired through OpenNext, and it could
-- only reach the report logic through an HTTP call anyway. pg_cron runs inside
-- the database that already holds the cadence settings and the run history, so
-- the schedule and its bookkeeping live together.
--
-- The job does not contain the agent logic. It calls `ops_agent_due()` (the same
-- predicate the console uses) and, only when a run is actually due, posts to the
-- app's token-guarded cron endpoint via pg_net. Two consequences worth keeping:
--
--   * Cadence changes in Admin take effect with no redeploy and no cron edit —
--     `report_interval_hours` is read at fire time, not at scheduling time.
--   * Every 15 minutes of ticks costs one cheap `ops_agent_due()` call; the
--     expensive work happens only when due. The endpoint is independently
--     idempotent, so an overlapping tick cannot double-run.
--
-- The secret is read out of Vault when the job is created. It is never committed
-- here: a migration file is source code, and a token in source is a leaked token.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;

/** Generates (or rotates) the shared cron token into Vault. */
create or replace function public.ensure_agent_cron_token()
returns boolean
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_existing text;
begin
  select decrypted_secret into v_existing
  from vault.decrypted_secrets
  where name = 'ops_agent_cron_token'
  limit 1;

  if v_existing is null then
    perform vault.create_secret(
      -- pgcrypto is installed into the `extensions` schema on this project, so
      -- it must be named explicitly from a `public`-pinned search_path.
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ops_agent_cron_token',
      'Bearer token for the scheduled ops-agent endpoint'
    );
  end if;
  return true;
end;
$$;

revoke all on function public.ensure_agent_cron_token() from public, anon, authenticated;

/**
 * The tick itself. Keeping the HTTP call inside a function (rather than in the
 * cron command) means the bearer token is read from Vault at run time and never
 * written into `cron.job.command`, where it would sit in plaintext in a system
 * table. The job command is therefore just `select public.agent_cron_tick();`.
 */
create or replace function public.agent_cron_tick()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_token text;
  v_base  text;
  v_due   boolean;
begin
  select (value #>> '{}') into v_base
  from public.settings
  where key = 'ops_agent.base_url';

  if v_base is null or v_base = '' or v_base = 'null' then
    return null; -- Not configured yet; ticking is a no-op, not an error.
  end if;

  select public.ops_agent_due('report') into v_due;
  if not v_due then
    return null; -- Nothing to do this tick.
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'ops_agent_cron_token'
  limit 1;

  if v_token is null then
    perform public.ensure_agent_cron_token();
    select decrypted_secret into v_token
    from vault.decrypted_secrets
    where name = 'ops_agent_cron_token'
    limit 1;
  end if;

  return net.http_post(
    url := rtrim(v_base, '/') || '/api/agent/cron',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.agent_cron_tick() from public, anon, authenticated;

/**
 * Reads the token and the base URL, then (re)schedules the tick. Safe to re-run:
 * it unschedules the previous job of the same name first.
 */
create or replace function public.schedule_agent_cron(p_base_url text)
returns boolean
language plpgsql
security definer
set search_path = public, vault, cron, net
as $$
begin
  if p_base_url is null or p_base_url !~ '^https://' then
    raise exception 'A https base URL is required' using errcode = '22023';
  end if;

  perform public.ensure_agent_cron_token();

  -- Persist the URL the tick should call. The token stays in Vault.
  insert into public.settings (key, value, description, is_public)
  values (
    'ops_agent.base_url',
    to_jsonb(rtrim(p_base_url, '/')),
    'Base URL the scheduled ops agent calls.',
    false
  )
  on conflict (key) do update set value = excluded.value, updated_at = now();

  -- Replace, never duplicate: a second schedule would double every run.
  perform cron.unschedule('panda-wok-agent-tick')
  where exists (select 1 from cron.job where jobname = 'panda-wok-agent-tick');

  perform cron.schedule(
    'panda-wok-agent-tick',
    '*/15 * * * *',
    'select public.agent_cron_tick();'
  );

  return true;
end;
$$;

revoke all on function public.schedule_agent_cron(text) from public, anon, authenticated;
grant execute on function public.schedule_agent_cron(text) to service_role;

-- Record the intended base URL on the app settings row so an operator can see
-- what the agent was pointed at. The schedule itself is created by an explicit
-- operator action, because a migration cannot know the deployment's origin.
insert into public.settings (key, value, description, is_public)
values (
  'ops_agent.base_url',
  'null'::jsonb,
  'Base URL the scheduled ops agent calls. Set this, then call schedule_agent_cron().',
  false
)
on conflict (key) do nothing;
