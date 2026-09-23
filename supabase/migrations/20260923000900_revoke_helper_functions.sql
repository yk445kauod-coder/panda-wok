-- Panda Wok :: lock down the two over-exposed helper functions
--
-- Both `log_audit_event` and `segment_user_ids` were granted to PUBLIC (the
-- `=X/postgres` entry in their ACLs), so anyone holding the anon key — which
-- ships in the browser bundle — could call them over PostgREST:
--
--   * `log_audit_event(action, entity, id, after)` inserts into `audit_logs`
--     as the definer. Any visitor could forge staff audit entries, which is
--     exactly the trail an operator would trust during an incident.
--   * `segment_user_ids('all')` returns every non-blocked profile id, handing
--     out the whole customer id list with no capability check at all.
--
-- Neither is reachable from a browser session: both are only used inside other
-- definer functions that already ran as the owner. Revoking PUBLIC/anon/
-- authenticated leaves the internal call path untouched and closes the HTTP
-- surface. `order_is_terminal` stays executable — it is SECURITY INVOKER, pure
-- and immutable — but gets a pinned search_path so it cannot be hijacked by a
-- shadowed operator on a caller's search_path.

begin;

revoke execute on function public.log_audit_event(text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.segment_user_ids(text, int)
  from public, anon, authenticated;

alter function public.order_is_terminal(order_status)
  set search_path = '';

commit;
