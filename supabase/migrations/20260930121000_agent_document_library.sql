-- Panda Wok :: team library — comments and reuse on documents
--
-- The deliverables panel is a shared library: owners and admins (the roles
-- `can_agent()` covers) can already see and export every document. What was
-- missing is the conversation *about* a document and a record of reuse.
--
--   agent_artifact_comments   a comment thread per document
--   agent_artifacts.reuse_count / last_reused_at   a lightweight reuse counter
--
-- Visibility stays exactly where it was: `can_agent()` (owner/admin). Nothing
-- here widens who can read a document — it only lets the people who can read one
-- discuss it and mark it as reused.

begin;

-- ------------------------------------------------------------------ comments

create table if not exists public.agent_artifact_comments (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.agent_artifacts (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  -- The gate actor's display name, so a passcode-only owner is still attributed
  -- by name rather than showing as anonymous.
  author_label text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_artifact_comments_idx
  on public.agent_artifact_comments (artifact_id, created_at);

alter table public.agent_artifact_comments enable row level security;

drop policy if exists agent_artifact_comments_staff_read on public.agent_artifact_comments;
create policy agent_artifact_comments_staff_read on public.agent_artifact_comments
  for select to authenticated using (public.can_agent());

-- Authorship is recorded from the server session, never trusted from the
-- browser; this policy is the second gate for any future direct client access.
drop policy if exists agent_artifact_comments_staff_write on public.agent_artifact_comments;
create policy agent_artifact_comments_staff_write on public.agent_artifact_comments
  for all to authenticated using (public.can_agent()) with check (public.can_agent());

-- ------------------------------------------------------------------ reuse

alter table public.agent_artifacts
  add column if not exists reuse_count int not null default 0;

alter table public.agent_artifacts
  add column if not exists last_reused_at timestamptz;

comment on column public.agent_artifacts.reuse_count is
  'How many times a staff member marked this document as reused in the console.';
comment on column public.agent_artifacts.last_reused_at is
  'When it was last marked reused, so the library can surface recently used documents.';

-- ---------------------------------------------------------------- RPC: reuse

/**
 * Marks a document as reused and returns the new count. Kept as a definer RPC so
 * the increment is atomic and cannot be raced by two admins clicking together.
 */
create or replace function public.mark_artifact_reused(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  if not (public.can_agent() or current_user in ('postgres', 'service_role')) then
    raise exception 'Not authorised to reuse documents' using errcode = '42501';
  end if;

  update public.agent_artifacts
     set reuse_count = reuse_count + 1,
         last_reused_at = now()
   where id = p_id
  returning reuse_count into v_count;

  return coalesce(v_count, 0);
end;
$$;

revoke execute on function public.mark_artifact_reused(uuid) from public, anon;
grant execute on function public.mark_artifact_reused(uuid) to authenticated;

commit;
