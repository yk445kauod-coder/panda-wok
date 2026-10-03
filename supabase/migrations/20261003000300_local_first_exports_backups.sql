-- Local-first exports and backups.
--
-- The owner asked for two things: keep the work on our own infrastructure
-- rather than round-tripping files through Supabase Storage (cloud egress and
-- object churn on a free plan), and produce genuinely readable output — real
-- XLSX and a clean TXT instead of raw CSV/JSON.
--
-- So a finished export/backup now carries its own bytes in a `content` column
-- and is streamed back by an admin route. `content_encoding` says how to decode
-- it: 'utf8' for text (txt/json) and 'base64' for the binary workbook.
--
-- Storage paths are left in place for rows created before this migration; they
-- are simply no longer written.

alter type export_format add value if not exists 'xlsx';
alter type export_format add value if not exists 'txt';

alter table exports add column if not exists content text;
alter table exports add column if not exists content_encoding text;

-- Backups gained the same treatment, plus a format so a readable workbook or
-- text dump can be produced alongside the restore-faithful JSON.
alter table backup_records add column if not exists format text not null default 'json';
alter table backup_records add column if not exists content text;
alter table backup_records add column if not exists content_encoding text;
