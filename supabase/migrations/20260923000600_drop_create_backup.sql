-- Panda Wok :: retire the placeholder backup RPC
--
-- `create_backup` recorded a row already marked `ready` whose "backup" was a
-- JSON manifest of table counts — it captured no rows, so nothing could ever be
-- restored from it. Backups are now built by `requestBackupAction`, which
-- exports real rows to the private `backups` bucket before flipping the row to
-- ready. Dropping this removes the second, non-restorable path that any
-- `authenticated` session with `backups.create` could still reach.

begin;

revoke execute on function public.create_backup(backup_kind, text)
  from public, anon, authenticated;

drop function if exists public.create_backup(backup_kind, text);

commit;
