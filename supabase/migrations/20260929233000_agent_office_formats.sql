-- Owner request (2026-09-29): documents must come out as real files — an Excel
-- spreadsheet, a Word document and a PDF — not only as markdown or HTML.
--
-- `agent_artifacts.format` was constrained to ('md','csv','json','html'), so a
-- PDF/DOCX/XLSX export would have been rejected by the check on insert. This
-- widens the allow-list. It is a constraint change only: no row is read,
-- updated or deleted, and every existing value stays valid.
--
-- The old constraint is dropped by name so this is safe to re-run.

alter table public.agent_artifacts
  drop constraint if exists agent_artifacts_format_check;

alter table public.agent_artifacts
  add constraint agent_artifacts_format_check
  check (format in ('md', 'csv', 'json', 'html', 'pdf', 'docx', 'xlsx'));
