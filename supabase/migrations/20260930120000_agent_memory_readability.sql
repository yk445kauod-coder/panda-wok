-- Panda Wok :: agent memory readability + thread compaction
--
-- Two additive changes, no data touched:
--
--   1. `agent_memory.has_embedding` — a generated boolean so the console can show
--      whether a memory is vector-searchable without selecting the 1024-float
--      vector (which must never reach the browser).
--
--   2. `agent_threads.summary` / `summary_upto` — a rolling summary of the turns
--      that have fallen out of the recent window, so a long conversation keeps
--      its thread instead of forgetting everything older than the last few
--      messages. The recent messages stay verbatim; the summary covers the rest.

begin;

alter table public.agent_memory
  add column if not exists has_embedding boolean
  generated always as (embedding is not null) stored;

comment on column public.agent_memory.has_embedding is
  'Generated: true when a vector exists. Read by the console so the vector column itself is never selected.';

alter table public.agent_threads
  add column if not exists summary text;

alter table public.agent_threads
  add column if not exists summary_upto timestamptz;

comment on column public.agent_threads.summary is
  'Rolling summary of turns older than the verbatim recent window, so long threads keep context.';
comment on column public.agent_threads.summary_upto is
  'Created-at watermark: messages at or before this are covered by `summary`.';

commit;
