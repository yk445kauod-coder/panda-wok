-- Admin-managed AI credentials, stored encrypted in Supabase Vault.
--
-- Why: the AI centre let an admin name an environment variable (`ai_providers
-- .secret_ref`) but never set the value, so rotating a key meant a redeploy and
-- the console could not actually manage credentials. These functions let the
-- ops console write the value into Vault (encrypted at rest) and let the server
-- read it back when resolving a provider.
--
-- Access model: the RPCs are SECURITY DEFINER and owned by `postgres` (which
-- holds USAGE on the `vault` schema). EXECUTE is granted to `service_role` only
-- — the role the ops console already runs as, because its access is decided by
-- the passcode/login-id gate, not by a Supabase session. `anon`/`authenticated`
-- are explicitly revoked, and the `vault` schema itself is not USAGE-granted to
-- them, so no browser can reach a stored key. The admin UI only ever receives a
-- masked hint, never the value.

create or replace function public.set_ai_secret(
  p_name text,
  p_value text,
  p_description text default null
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if p_name is null or p_name !~ '^[A-Za-z_][A-Za-z0-9_]{0,127}$' then
    raise exception 'Invalid secret name' using errcode = '22023';
  end if;
  if p_value is null or length(p_value) < 8 then
    raise exception 'Secret value is too short' using errcode = '22023';
  end if;

  select id into v_id from vault.secrets where name = p_name order by created_at asc limit 1;

  if v_id is null then
    perform vault.create_secret(p_value, p_name, coalesce(p_description, 'Managed from the Panda Wok AI centre'));
  else
    perform vault.update_secret(v_id, p_value, p_name, coalesce(p_description, 'Managed from the Panda Wok AI centre'));
  end if;

  -- Vault has no unique index on `name`; collapse any historical duplicates so
  -- get_ai_secret is deterministic.
  delete from vault.secrets s
  where s.name = p_name
    and s.id <> (select id from vault.secrets where name = p_name order by created_at desc limit 1);

  return p_name;
end;
$$;

create or replace function public.get_ai_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = p_name
  order by created_at desc
  limit 1;
$$;

/**
 * Names and a masked hint only — never a plaintext value. The last four
 * characters are enough for an operator to recognise which key is installed
 * without exposing it.
 */
create or replace function public.list_ai_secret_hints()
returns table (name text, hint text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, vault
as $$
  select
    name,
    case
      when decrypted_secret is null or length(decrypted_secret) < 4 then '••••'
      else '••••' || right(decrypted_secret, 4)
    end as hint,
    updated_at
  from vault.decrypted_secrets
  order by name;
$$;

revoke all on function public.set_ai_secret(text, text, text) from public, anon, authenticated;
revoke all on function public.get_ai_secret(text) from public, anon, authenticated;
revoke all on function public.list_ai_secret_hints() from public, anon, authenticated;

grant execute on function public.set_ai_secret(text, text, text) to service_role;
grant execute on function public.get_ai_secret(text) to service_role;
grant execute on function public.list_ai_secret_hints() to service_role;
