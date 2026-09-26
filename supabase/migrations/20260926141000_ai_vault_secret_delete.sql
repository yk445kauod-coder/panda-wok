-- Deletion counterpart to set_ai_secret/get_ai_secret. Keeping it as an RPC
-- means the app never has to touch `vault.secrets` directly (the vault schema is
-- not in the generated types and is not reachable by browser roles anyway).
create or replace function public.delete_ai_secret(p_name text)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_deleted integer;
begin
  if p_name is null or p_name !~ '^[A-Za-z_][A-Za-z0-9_]{0,127}$' then
    raise exception 'Invalid secret name' using errcode = '22023';
  end if;

  delete from vault.secrets where name = p_name;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.delete_ai_secret(text) from public, anon, authenticated;
grant execute on function public.delete_ai_secret(text) to service_role;
