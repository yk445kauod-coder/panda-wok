-- Enables the in-account Cloudflare Workers AI binding as the primary assistant
-- provider.
--
-- The binding is keyless: the app worker already declares `"ai": {"binding":
-- "AI"}` in wrangler.jsonc, so the platform supplies the credential and no
-- secret is stored here (secret_ref stays null on purpose). resolveDbProvider()
-- returns null when the binding is missing — a plain `next dev`/`next build`
-- has no bindings — and the chain then drops to the deterministic grounded row
-- below, so the assistant keeps answering without a key in every environment.
--
-- priority 10 puts it ahead of the deterministic floor at 900. Idempotent:
-- re-running only updates the row named 'workers-ai-binding'.

insert into public.ai_providers (
  name, kind, base_url, model, secret_ref,
  is_enabled, is_fallback, priority, max_requests_per_minute, config
)
values (
  'workers-ai-binding',
  'cloudflare',
  null,
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  null,
  true,
  false,
  10,
  20,
  '{"source":"wrangler-ai-binding","keyless":true}'::jsonb
)
on conflict (name) do update set
  kind = excluded.kind,
  model = excluded.model,
  secret_ref = excluded.secret_ref,
  is_enabled = excluded.is_enabled,
  is_fallback = excluded.is_fallback,
  priority = excluded.priority,
  max_requests_per_minute = excluded.max_requests_per_minute,
  config = excluded.config;
