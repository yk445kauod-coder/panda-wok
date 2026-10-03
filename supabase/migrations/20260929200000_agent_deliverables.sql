-- Panda Wok :: ops-agent deliverables (generated files, reports, documents)
--
-- The agent could observe and propose, but it could not *produce* anything a
-- human could open, send or file. This adds the missing half: a table of
-- generated deliverables (a rendered document/report/sheet), a private storage
-- bucket for the bytes, and the RPCs the worker uses to record one.
--
-- Design mirrors `exports`: a row is created first (so a failure is auditable),
-- the bytes are rendered and uploaded, then the row is flipped to `ready`. The
-- download is a short-lived signed URL minted at render time — the URL is never
-- stored.
--
-- Kind values are the restaurant-operational document types the owner asked
-- for: a daily sales sheet, a menu-engineering report, a stock reorder list, a
-- win-back campaign draft, a KPI digest, an end-of-day reconciliation.

-- ------------------------------------------------------------------ table

create table if not exists public.agent_artifacts (
  id uuid primary key default gen_random_uuid(),
  -- The run that produced it, when it came from a scheduled/manual report.
  run_id uuid references public.ops_agent_runs (id) on delete set null,
  kind text not null check (kind in (
    'daily_sales', 'weekly_kpi', 'menu_engineering', 'stock_reorder',
    'winback_draft', 'pricing_review', 'eod_reconciliation', 'custom'
  )),
  title text not null,
  -- Human-readable summary shown in the console next to the download.
  summary text,
  format text not null default 'md' check (format in ('md', 'csv', 'json', 'html')),
  status text not null default 'building'
    check (status in ('building', 'ready', 'failed')),
  -- Bytes live in the private `artifacts` bucket; only the path is stored.
  storage_path text,
  bytes bigint,
  row_count int,
  -- The exact structured data the document was rendered from, so a reader can
  -- verify a figure without re-deriving it, and the model can cite it.
  data jsonb not null default '{}'::jsonb,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists agent_artifacts_created_idx
  on public.agent_artifacts (kind, created_at desc);

alter table public.agent_artifacts enable row level security;

drop policy if exists agent_artifacts_staff_read on public.agent_artifacts;
create policy agent_artifacts_staff_read on public.agent_artifacts
  for select to authenticated using (public.can_agent());

drop policy if exists agent_artifacts_staff_write on public.agent_artifacts;
create policy agent_artifacts_staff_write on public.agent_artifacts
  for all to authenticated using (public.can_agent()) with check (public.can_agent());

-- ------------------------------------------------------------------ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artifacts', 'artifacts', false, 52428800, null)
on conflict (id) do nothing;

-- Private: staff read only. All writes go through the server with the service
-- role, so a browser cannot forge a path into the bucket.
drop policy if exists storage_artifacts_read on storage.objects;
create policy storage_artifacts_read on storage.objects
  for select to authenticated using (bucket_id = 'artifacts' and public.can_agent());

-- ------------------------------------------------------------------ RPCs

/**
 * Opens a deliverable row and returns its id. The file is uploaded afterwards
 * with the service role; the row starts `building` so a crash between the two
 * leaves an auditable failure rather than a missing record.
 */
create or replace function public.open_artifact(
  p_kind text,
  p_title text,
  p_summary text,
  p_format text,
  p_data jsonb,
  p_run_id uuid default null,
  p_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.agent_artifacts
    (kind, title, summary, format, status, data, run_id, created_by)
  values
    (p_kind, p_title, p_summary, coalesce(nullif(p_format, ''), 'md'), 'building',
     coalesce(p_data, '{}'::jsonb), p_run_id, p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;

/**
 * Marks a deliverable ready after its bytes are stored.
 */
create or replace function public.finish_artifact(
  p_id uuid,
  p_storage_path text,
  p_bytes bigint,
  p_row_count int
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.agent_artifacts
     set status = 'ready',
         storage_path = p_storage_path,
         bytes = p_bytes,
         row_count = p_row_count,
         completed_at = now()
   where id = p_id;
end;
$$;

/**
 * Records a failure so the console can show why a deliverable is missing.
 */
create or replace function public.fail_artifact(p_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.agent_artifacts
     set status = 'failed',
         error = left(coalesce(p_error, 'Unknown error'), 500),
         completed_at = now()
   where id = p_id;
end;
$$;

-- RPCs are called server-side with the service role only. Revoking from the
-- API roles keeps the definer surface as small as the rest of the schema.
revoke execute on function public.open_artifact(text, text, text, text, jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.finish_artifact(uuid, text, bigint, int) from public, anon, authenticated;
revoke execute on function public.fail_artifact(uuid, text) from public, anon, authenticated;
