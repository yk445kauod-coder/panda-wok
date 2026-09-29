# Data safety policy — the permanent rule

This is a standing operating rule for every session on this repository, not a
one-off instruction. It is deliberately short because it admits no exceptions.

## ⛔ The menu database is off-limits — nobody touches it

This is the sharpest edge of the rule, stated first because it is the one most
likely to be crossed "helpfully":

**Nobody — human or agent — writes to the menu tables. Ever.**

- Tables: `categories`, `menu_items`, `menu_images`, `modifier_groups`,
  `modifier_options`, `upsell_rules`.
- No insert, no update, no delete, no re-import, no "cleanup", no price sync, no
  name or image rewrite — **unless the owner has explicitly asked, in writing,
  for that specific change**.
- The **only** normal write path is a human editing one dish at a time in
  `/admin`. An agent does not bulk-edit the menu, and does not run
  `scripts/import-menu.mjs` (insert-only) or `scripts/import-menu-csv.mjs`
  (`--apply`) to change it.
- If a task appears to need a menu change, **stop and ask the owner first**, state
  exactly what would change, and offer the flag-based alternative
  (`is_available = false` / `is_enabled = false`).
- Both catalogues are public and stay public — the Chinese menu and the Japanese
  sushi menu are live together on `/menu`; never disable either.

The rest of this document is the general policy this rule is a special case of.

## The rule

**Nothing is ever deleted. Data is never tampered with.**

1. **Never delete rows** from the live database — no `DELETE`, no `DROP TABLE`,
   no `TRUNCATE`, no "cleanup" — unless the owner has explicitly asked, in
   writing, for that specific deletion.
2. **Never mutate business data** (prices, menu items, categories, orders,
   profiles, settings, loyalty, stock) as a side effect of code work. A schema
   migration may add columns, indexes or policies; it must not rewrite the rows a
   customer or the owner already entered.
3. **Hide, don't destroy.** When content should come off the site, use a flag —
   `is_enabled`, `is_available`, `is_published`, `is_active`. The row, its
   translations, its modifiers and its images stay in the database and a single
   flag flip brings it back. Example: a seasonal dish whose ingredients are out
   of stock is set `is_available = false` rather than deleted — it returns the
   moment it is back, with its price and copy intact.
4. **Do not hide the owner's published content on an assumption.** Hiding is
   reversible, but a hidden dish is still a change the owner did not ask for.
   Only flag content off when the owner has explicitly said so; when in doubt,
   leave it live and ask. **Both catalogues are public and stay public** — the
   Chinese menu and the Japanese sushi menu are live together on `/menu`, and
   neither is to be disabled.
5. **No re-import to "refresh".** `scripts/import-menu.mjs` is insert-only and
   would duplicate the catalogue. Do not run it to update an existing menu.
6. **Idempotent and reversible.** Any migration that changes structure should be
   safe to run twice (`if not exists`, `on conflict`) and should leave the data
   as it was. Prefer additive migrations over rewriting ones.
7. **The admin CMS is the write path for content.** Business content is edited by
   a human in `/admin`, with full context, not by a script or an agent.

## Why

The live project is the real business. A deleted dish or a silently rewritten
price is a loss that no `git revert` can undo, because the data is not in git —
only the schema is. Hiding is always reversible; deleting never is.

## How this is enforced in practice

- Verify data changes against the live project (`supabase` SQL) before and after,
  and report row counts, rather than assuming a migration "worked".
- When a task seems to require a deletion, stop and ask the owner first. State
  what would be removed and offer the flag-based alternative.
- Never read server-side files or run OS commands through SQL
  (`COPY … FROM PROGRAM`, `pg_read_file`, `lo_import`) — that is both a safety and
  a security boundary.

## Migration-ordering trap (learned the hard way)

When you reverse a flag change with a **new** migration, its version must sort
*after* the one it reverses. A restore migration once landed through the MCP tool
with a timestamp numerically *before* the change it reversed, so a fresh
`supabase db reset` would have applied them out of order. The fix is procedural:
name the migration file with a timestamp later than the change it undoes,
confirm `supabase migration list` shows no local-only / remote-only rows, and
remember that the *filename* is the version — an MCP `apply_migration` supplies
its own timestamp unless you control it.

## Related

- `AGENTS.md` — session notes, including the hide-not-delete examples.
- `docs/architecture.md` §2.1 — the fallback rule ("absent row renders existing
  copy") that keeps the DB additive.
