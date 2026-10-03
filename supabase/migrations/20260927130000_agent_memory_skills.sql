-- Panda Wok :: agent vector memory + lazy skill index
--
-- Two free capabilities, both entirely inside Supabase:
--
--   agent_skills  a chunked index of skill documents (repo AGENTS.md / skills.md /
--                 Claude skills / imported GitHub skills). Chunks are small on
--                 purpose: retrieval returns only the few relevant lines, so the
--                 agent reads *a few lines* rather than whole files and never
--                 burns the context window on instructions it is not using.
--
--   agent_memory  durable facts the agent has learned (owner preference, a
--                 repeated customer request, a decision rationale), retrieved by
--                 cosine similarity so only the relevant memory is injected.
--
-- Embeddings come from the in-account Workers AI binding (`@cf/baai/bge-m3`,
-- multilingual, no API key), so there is no paid embedding service. pgvector is
-- the free vector store that ships with Supabase.
--
-- `vector` is installed into the `extensions` schema, matching how pg_trgm was
-- relocated in the tenancy hardening — extensions do not belong in `public`.

begin;

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------- skills

create table if not exists public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  -- Skill identity, e.g. "repo:AGENTS.md" or "github:owner/repo/skills/foo".
  name text not null,
  -- Where the text came from. Drives how the sync refreshes it.
  source text not null default 'repo'
    check (source in ('repo', 'github', 'claude', 'agents_md', 'manual')),
  source_url text,
  -- Small retrieval unit: one heading/paragraph, a handful of lines at most.
  heading text,
  content text not null,
  -- Ordering within the source document, so context can be reconstructed.
  chunk_index int not null default 0,
  embedding extensions.vector(1024),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists agent_skills_name_idx on public.agent_skills (name, chunk_index);
-- HNSW works well on small/medium tables and needs no training pass like ivfflat.
create index if not exists agent_skills_embedding_idx
  on public.agent_skills using hnsw (embedding extensions.vector_cosine_ops);

alter table public.agent_skills enable row level security;

drop policy if exists agent_skills_staff_read on public.agent_skills;
create policy agent_skills_staff_read on public.agent_skills
  for select to authenticated using (public.can_agent());

drop policy if exists agent_skills_staff_write on public.agent_skills;
create policy agent_skills_staff_write on public.agent_skills
  for all to authenticated using (public.can_agent()) with check (public.can_agent());

-- ---------------------------------------------------------------- memory

create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  -- Who the memory belongs to. `owner` memories are business-level; a `customer`
  -- memory is scoped to that customer and is never shown to another.
  scope text not null default 'owner' check (scope in ('owner', 'customer', 'system')),
  subject_id uuid references auth.users (id) on delete cascade,
  kind text not null default 'fact',
  content text not null,
  -- Free-form provenance, e.g. {"runId": "...", "actionId": "..."}.
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1024),
  created_at timestamptz not null default now()
);
create index if not exists agent_memory_scope_idx on public.agent_memory (scope, subject_id, created_at desc);
create index if not exists agent_memory_embedding_idx
  on public.agent_memory using hnsw (embedding extensions.vector_cosine_ops);

alter table public.agent_memory enable row level security;

drop policy if exists agent_memory_staff_read on public.agent_memory;
create policy agent_memory_staff_read on public.agent_memory
  for select to authenticated using (public.can_agent());

-- A customer may read and write only their own memory rows. This is what lets
-- the customer assistant remember a preference without exposing anyone else's.
drop policy if exists agent_memory_self on public.agent_memory;
create policy agent_memory_self on public.agent_memory
  for all to authenticated
  using (scope = 'customer' and subject_id = (select auth.uid()))
  with check (scope = 'customer' and subject_id = (select auth.uid()));

drop policy if exists agent_memory_staff_write on public.agent_memory;
create policy agent_memory_staff_write on public.agent_memory
  for all to authenticated using (public.can_agent()) with check (public.can_agent());

-- ---------------------------------------------------------------- RPCs

/** Replaces a skill's chunks atomically so a re-sync never leaves a partial doc. */
create or replace function public.replace_agent_skill(
  p_name text,
  p_source text,
  p_source_url text,
  p_chunks jsonb
)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_chunk jsonb;
  v_index int := 0;
  v_count int := 0;
begin
  if not (public.can_agent() or current_user in ('postgres', 'service_role')) then
    raise exception 'Not authorised to index skills' using errcode = '42501';
  end if;
  if p_name is null or p_name = '' then
    raise exception 'A skill needs a name' using errcode = '22023';
  end if;

  delete from public.agent_skills where name = p_name;

  for v_chunk in select * from jsonb_array_elements(coalesce(p_chunks, '[]'::jsonb)) loop
    insert into public.agent_skills (name, source, source_url, heading, content, chunk_index, embedding)
    values (
      p_name,
      coalesce(p_source, 'repo'),
      p_source_url,
      v_chunk->>'heading',
      v_chunk->>'content',
      coalesce((v_chunk->>'chunk_index')::int, v_index),
      case when (v_chunk->>'embedding') is not null
           then (v_chunk->>'embedding')::extensions.vector
           else null end
    );
    v_index := v_index + 1;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

/**
 * Retrieval for skills. Returns only `p_match_count` small chunks, which is what
 * keeps the agent's context cheap: it sees the few lines that matter, not the
 * whole skill library.
 */
create or replace function public.match_agent_skills(
  p_query_embedding extensions.vector(1024),
  p_match_count int default 4,
  p_min_similarity numeric default 0.1
)
returns table (name text, heading text, content text, similarity numeric)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.name, s.heading, s.content,
         1 - (s.embedding <=> p_query_embedding) as similarity
  from public.agent_skills s
  where s.embedding is not null
    and 1 - (s.embedding <=> p_query_embedding) >= p_min_similarity
  order by s.embedding <=> p_query_embedding
  limit greatest(coalesce(p_match_count, 4), 1);
$$;

/** Appends a memory row. Returns its id. */
create or replace function public.add_agent_memory(
  p_scope text,
  p_subject_id uuid,
  p_kind text,
  p_content text,
  p_metadata jsonb,
  p_embedding extensions.vector(1024)
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not (
    public.can_agent()
    or current_user in ('postgres', 'service_role')
    or (p_scope = 'customer' and p_subject_id = (select auth.uid()))
  ) then
    raise exception 'Not authorised to write memory' using errcode = '42501';
  end if;

  insert into public.agent_memory (scope, subject_id, kind, content, metadata, embedding)
  values (
    coalesce(p_scope, 'owner'), p_subject_id, coalesce(p_kind, 'fact'), p_content,
    coalesce(p_metadata, '{}'::jsonb), p_embedding
  )
  returning id into v_id;

  return v_id;
end;
$$;

/**
 * Retrieval for memory. `p_subject_id` scopes customer memories: a customer only
 * ever matches rows for their own id (or unscoped owner/system rows when the
 * caller is staff).
 */
create or replace function public.match_agent_memory(
  p_query_embedding extensions.vector(1024),
  p_scope text default 'owner',
  p_subject_id uuid default null,
  p_match_count int default 5,
  p_min_similarity numeric default 0.15
)
returns table (id uuid, scope text, kind text, content text, similarity numeric, created_at timestamptz)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select m.id, m.scope, m.kind, m.content,
         1 - (m.embedding <=> p_query_embedding) as similarity,
         m.created_at
  from public.agent_memory m
  where m.embedding is not null
    and m.scope = p_scope
    and (p_subject_id is null or m.subject_id is null or m.subject_id = p_subject_id)
    and 1 - (m.embedding <=> p_query_embedding) >= p_min_similarity
  order by m.embedding <=> p_query_embedding
  limit greatest(coalesce(p_match_count, 5), 1);
$$;

revoke execute on function public.replace_agent_skill(text,text,text,jsonb) from public, anon;
revoke execute on function public.match_agent_skills(extensions.vector,int,numeric) from public, anon;
revoke execute on function public.add_agent_memory(text,uuid,text,text,jsonb,extensions.vector) from public, anon;
revoke execute on function public.match_agent_memory(extensions.vector,text,uuid,int,numeric) from public, anon;

grant execute on function public.replace_agent_skill(text,text,text,jsonb) to authenticated;
grant execute on function public.match_agent_skills(extensions.vector,int,numeric) to authenticated;
grant execute on function public.add_agent_memory(text,uuid,text,text,jsonb,extensions.vector) to authenticated;
grant execute on function public.match_agent_memory(extensions.vector,text,uuid,int,numeric) to authenticated;

commit;
