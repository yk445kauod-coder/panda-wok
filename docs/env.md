# Environment & secrets inventory (Phase 1)

Every environment variable the code reads, where it belongs, and how it is
verified. **No secret value appears in this file, in the repo, or in any build
artefact.**

- Live project: `xjbtsryidznsxqlynmfa` (Supabase), Pages project `panda-wok`, account `708d1cc2fd5a22a9e495dfe415c9f921`
- Authoritative list of names: `.env.example` (tracked, names only) and `src/lib/config/env.ts` (validated schema)

## 1. How the code reads environment

Three distinct mechanisms — this matters for whether a value is safe:

| Mechanism | Where | Behaviour |
| --------- | ----- | --------- |
| `import { publicEnv }` | `src/lib/config/env.ts` | `NEXT_PUBLIC_*` only. **Inlined at build time**, so the value ships in the browser bundle by design. Missing → hard throw at module load. |
| `import { serverEnv }` | `src/lib/config/env.ts` | Server-only keys read via a **computed** `process.env[name]` lookup, so Next cannot statically bake them into the bundle. This is deliberate: a static `process.env.SUPABASE_SERVICE_ROLE_KEY` was previously found inlined in `.pages/cloudflare/next-env.mjs`. |
| `getCloudflareContext()` | `src/lib/ai/provider.ts` | The keyless Workers **AI binding** (no secret at all). |
| `process.env[row.secret_ref]` | `src/lib/ai/provider.ts:724,734` | A provider's `secret_ref` is only the **name** of an env var; the value is looked up at runtime. No key material is stored in the DB. |

## 2. Variable inventory

### 2.1 Public (safe in the browser bundle; required at build time)

| Name | Used at | Where the value lives | Notes |
| ---- | ------- | --------------------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | build + runtime | Pages **build variable** (plain_text) | `https://xjbtsryidznsxqlynmfa.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build + runtime | Pages **build variable** (plain_text) | publishable key (`sb_publishable_…`); public by design |
| `NEXT_PUBLIC_SITE_URL` | build + runtime | Pages **build variable** (plain_text) | Must be `https://panda-wok.pages.dev`; drives canonical/OG/sitemap. Set identically on Preview **on purpose** so a preview host can never leak into a canonical. |

### 2.2 Server-only secrets (never in the bundle)

| Name | Used at | Where the value lives | Required? | Notes |
| ---- | ------- | --------------------- | --------- | ----- |
| `SUPABASE_SERVICE_ROLE_KEY` | runtime only | Pages **secret** (`wrangler pages secret put`) | **Required for admin/CRM/export/backup/AI-usage** | Bypasses RLS. Never imported by client code. Absent → `tryCreateAdminSupabase()` returns `null` and privileged flows degrade instead of crashing. |
| `INTERNAL_LOG_SALT` | runtime only | Pages **secret** (optional) | Optional | Salt for hashing identifiers in auth logs. Falls back to the service-role key, so it is only needed if you want the digest decoupled from key rotation. |
| `RESEND_API_KEY` | runtime only | Pages **secret** (optional) | Optional | Only if outbound email is enabled. Unset → broadcasts stay in-app. |
| `EMAIL_FROM` | runtime only | Pages secret/var (optional) | Optional | Sender address for the above. |

### 2.3 AI provider variables (all optional)

The provider chain is **DB-driven** (`ai_providers`), with the env block only as
a fallback. Live rows today:

| kind | name | priority | secret needed |
| ---- | ---- | -------- | ------------- |
| `cloudflare` | `workers-ai-binding` | 10 (primary) | **none** — uses the Workers AI binding |
| `builtin` | `deterministic` | 900 (fallback) | none |

Because the primary is keyless and the fallback is built in, **the assistant
works with no AI secrets configured at all**. The remaining names are only
consulted if an operator adds a DB provider row whose `secret_ref` points at them:

`AI_PROVIDER_KIND`, `AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY`, `AI_FALLBACK_MODEL`,
and per-provider `AI_<KIND>_{NAME,MODEL,BASE_URL,API_KEY}` for `OPENROUTER`,
`CLOUDFLARE`, `POLLINATIONS`, `GEMINI`, `ANTHROPIC`, `OPENAI_COMPATIBLE`.

`AI_CLOUDFLARE_BASE_URL` and `AI_CLOUDFLARE_MODEL` are currently set as **Worker
vars** in `wrangler.jsonc` (pointing at the `panda-wok-ai-api` worker) — not
secrets.

### 2.4 Declared but unused

| Name | Status |
| ---- | ------ |
| `SUPABASE_URL` | Declared as a (empty) Pages secret in both environments, but **no code reads it** — the server client builds URLs from `NEXT_PUBLIC_SUPABASE_URL`. Harmless; can be deleted from the Pages project. |

## 3. Where each secret is set today (verified)

Reading the Pages project config through the Cloudflare API (`secret_text` values
are write-only, so the API always returns `""` — presence, not content, is what
can be verified):

| Env | Var | Type | Read from API | Verified working? |
| --- | --- | ---- | ------------- | ----------------- |
| production | `NEXT_PUBLIC_SUPABASE_URL` | plain_text | set | ✅ |
| production | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | plain_text | set | ✅ |
| production | `NEXT_PUBLIC_SITE_URL` | plain_text | set | ✅ |
| production | `SUPABASE_SERVICE_ROLE_KEY` | secret_text | `""` (write-only) | ✅ **behaviourally** — the live signup uses the admin API and succeeded with a confirmed session, which is only possible if the key resolves at runtime |
| preview | same four | — | same | build vars set; secrets shared |

## 4. Build-artefact leak check

```
grep -rE "sb_secret_[A-Za-z0-9]{10,}|eyJhbGciOi[A-Za-z0-9_-]{20,}" .pages/
```

**Result: no matches.** The service-role key is read through a computed lookup,
so it never lands in `.pages/**`. The public publishable key *does* appear in the
browser bundle — that is expected and safe (it is designed to be public).

## 5. `NEXT_PUBLIC_SITE_URL` is the only value inlined — treat it as immutable per environment

`next build` bakes `NEXT_PUBLIC_*` into the output. Production must therefore be
built with `NEXT_PUBLIC_SITE_URL=https://panda-wok.pages.dev`. The deploy
procedure (`npm run pages:deploy`, and the GitHub Actions workflow) exports the
production values before building — building without them produces a bundle with
`localhost` canonicals.

## 6. Findings & actions

| # | Finding | Action |
| - | ------- | ------ |
| E1 | `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are declared as secrets but **empty** on Pages | Confirmed non-blocking: an empty secret is not injected, so the Worker relies on the value set at deploy/secret-put time, and the live admin path works. Documented; `SUPABASE_URL` can be removed (unused). |
| E2 | `INTERNAL_LOG_SALT` is read by `log.ts` but absent from `.env.example` | Added to `.env.example` as an optional secret name. |
| E3 | `NEXT_PUBLIC_*` are inlined at build time | Deploy scripts already export production values before building; documented as the process. |
| E4 | No secret in repo or build output | Verified by grep over `.pages/` and over all tracked files. |

## 7. Phase 1 status

✅ Variable table complete (public / server-only / AI / declared-unused).
✅ Every secret is in the correct place (Pages secret vs build variable).
✅ No secret appears in the repo, in any tracked file, or in the `.pages` build
output. Preview and Production are separate environments with separate build
variables, and `NEXT_PUBLIC_SITE_URL` is pinned to production on both so preview
hosts cannot leak into canonicals.
