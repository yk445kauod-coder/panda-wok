-- Panda Wok :: retire the placeholder export RPC
--
-- `create_export` inserted a row already marked `ready` without producing any
-- file, so the dashboard advertised a downloadable export that did not exist.
-- Exports are now built by `requestExportAction`, which writes real CSV/JSON to
-- the private `exports` bucket and only then flips the row to ready. Keeping the
-- old function would leave a second, fake path that any `authenticated` session
-- could still call.

begin;

revoke execute on function public.create_export(text, export_format)
  from public, anon, authenticated;

drop function if exists public.create_export(text, export_format);

commit;
