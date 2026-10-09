-- Task-based model routing for the AI provider chain.
--
-- Why: one chain for every workload made the model choice a compromise. The
-- owner wants the free, strong model on the hard work (agentic turns, tool use,
-- document generation), the keyless Workers AI binding on the cheap recurring
-- work (scheduled ops reports, daily summaries), and OpenRouter on chat when a
-- key is configured — with the shared free providers (pollinations) and the
-- deterministic floor still there when a routed provider is missing.
--
-- `ai_providers.routes` is a {task -> priority} map:
--   { "chat": 5, "ops": 30, "agentic": 4 }
-- A provider is eligible for every task, and for a task present in the map its
-- priority is the map value instead of the row's base `priority` (lower runs
-- first). A task absent from the map uses the base priority unchanged, so an
-- untouched row behaves exactly as before and an empty `{}` means "eligible for
-- every task at the base priority" — the previous single-chain behaviour.
--
-- The `is_fallback` flag is orthogonal: a fallback-only row is never chosen as
-- the primary for any task, it is tried after the task's primaries. The
-- deterministic provider stays the floor.
--
-- Task vocabulary (must match src/lib/ai/provider.ts AI_TASKS):
--   chat     — the customer assistant and the operator chat: short, tool-light.
--   ops      — the scheduled ops agent: recurring reports, daily/weekly tasks.
--   agentic  — the multi-step operator agent: tool loops and document work.

alter table public.ai_providers
  add column if not exists routes jsonb not null default '{}'::jsonb;

comment on column public.ai_providers.routes is
  'Task-based routing: {"chat": n, "ops": n, "agentic": n} overrides `priority` per task. Missing task = base priority. Empty = eligible for all at base priority.';

-- Route the live rows to the owner's intent. These are orchestration config,
-- not menu/service data; ids are resolved by name so this stays portable.
--   agentic (hard, tool-using, documents)  -> gemini-free first
--   ops     (daily reports)                -> the Workers AI binding first
--   chat    -> openrouter-free first when its key is present
-- pollinations keeps an empty map (eligible everywhere at its base priority),
-- so it remains the shared free fallback for every task.
update public.ai_providers
  set routes = jsonb_build_object('agentic', 10, 'ops', 30, 'chat', 40)
  where name = 'gemini-free';

update public.ai_providers
  set routes = jsonb_build_object('ops', 10, 'chat', 20, 'agentic', 40)
  where name = 'workers-ai';

update public.ai_providers
  set routes = jsonb_build_object('chat', 10, 'agentic', 20, 'ops', 30)
  where name = 'openrouter-free';

-- Pollinations and the deterministic floor keep the empty map: pollinations is
-- eligible for every task at its base priority (priority 20), and the
-- deterministic row is fallback-only so it is the floor regardless.
update public.ai_providers
  set routes = '{}'::jsonb
  where name in ('pollinations', 'deterministic');
