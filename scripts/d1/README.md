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
