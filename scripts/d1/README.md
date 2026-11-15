# D1 backend

The Cloudflare-side replacement for Supabase, built so the app code does not
change: `src/lib/supabase/*` keeps returning an object with the same shape, and
`DATA_BACKEND=d1` swaps the implementation underneath.

## Pieces

- `generate-schema.py` — writes `migrations/0001_init.sql` from the live Postgres
  schema. Type mapping: uuid/vector/citext/text[] -> TEXT, timestamptz -> TEXT
  ISO-8601, jsonb -> TEXT, bool -> INTEGER, numeric/float -> REAL, enums ->
  TEXT + CHECK. `now()` -> `CURRENT_TIMESTAMP`, `gen_uuid()` -> a randomblob
  expression; `current_restaurant_id()` is filled by the shim because SQLite
  forbids a subquery in a DEFAULT.
- `load-catalog.py` — loads the real menu (19 categories, 87 dishes), restaurant,
  settings, flags, announcements, delivery zones and FAQs from
  `scripts/seed/catalog-backup.json`, the last reachable copy of the catalogue.

## Commands

    python3 scripts/d1/generate-schema.py migrations/0001_init.sql
    wrangler d1 execute panda-wok --remote --file=migrations/0001_init.sql --yes
    python3 scripts/d1/load-catalog.py > /tmp/catalog.sql
    wrangler d1 execute panda-wok --remote --file=/tmp/catalog.sql --yes

`wrangler d1 migrations apply` does not work here: wrangler 4.136 rejects a
`migrations_dir` field, and D1's SQL parser rejects `DEFAULT now()` (the exact
error is `near "(": syntax error`, which is what a missing function looks like).
Run the file with `d1 execute` instead.

## What is not here yet

- The order/auth/customer rows: Supabase is restricted, so the only read path is
  `execute_sql` through MCP. 49 users' bcrypt hashes, 45 orders and 40 addresses
  are readable and can be exported on request.
- R2: the account has R2 disabled (`wrangler r2 bucket list` -> code 10042, and
  the API returns the same). The bindings are declared in `wrangler.jsonc`; the
  buckets start working the moment R2 is enabled in the dashboard.

## The compatibility layer

`src/lib/d1/` is a supabase-js-shaped client over D1. The app makes 323
`.from()` calls and 48 `.rpc()` calls; keeping the interface means none of them
change, and `DATA_BACKEND=supabase` still returns the real Supabase client.

- `database.ts` — the D1 handle and request context (user, restaurant, elevated).
  Structural types, so the same code runs in a Worker, a script and a test.
- `coerce.ts` — the type translation both ways: booleans are 0/1, jsonb and
  arrays are JSON text, `2026-11-15 10:30:00` reads back as an ISO string.
- `sql.ts` — SQL compilation, kept separate so it is testable without a database.
- `client.ts` — the chainable builder. Implements the subset measured from the
  call sites: eq/neq/gt/gte/lt/lte/like/ilike/is/in/or/not/contains/match,
  order/limit/range, single/maybeSingle, select/insert/update/upsert/delete,
  count/head, and one level of embedded relations.
- `rpc.ts` — Postgres functions ported to TypeScript. `place_order` and
  `cancel_order` are done; anything unported fails loudly (PGRST202) rather than
  returning empty data.
- `schema-meta.ts` — generated. The boolean and JSON column lists the coercion
  layer reads.

`tests/d1-compat.test.ts` runs the layer against a real SQLite engine
(`node:sqlite`) with the real schema and the real catalogue — 14 tests covering
reads, writes, embeds and `place_order`. No mocks.

## Postgres defaults with no SQLite equivalent

| Postgres | SQLite |
| --- | --- |
| `now()` | `CURRENT_TIMESTAMP` |
| `gen_uuid()` | a `randomblob` expression |
| `current_restaurant_id()` | filled by the shim — SQLite forbids a subquery in a DEFAULT |
