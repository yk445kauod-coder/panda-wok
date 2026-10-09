-- One round trip for the whole settings form.
--
-- The form used to issue one PostgREST PATCH per row (34 today). On the free
-- plan a Cloudflare Worker gets a small subrequest budget per request, so the
-- save began failing part-way through with a generic error while the response
-- was still HTTP 200 — the worst failure mode, since the operator sees
-- "something went wrong" and cannot tell which key survived.
--
-- Applying the whole array inside one function is a single subrequest and a
-- single transaction, so a bad value can no longer leave the settings
-- half-written either.
create or replace function public.apply_settings_batch(
  p_values jsonb,
  p_actor uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  entry jsonb;
  applied integer := 0;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'array' then
    raise exception 'SETTINGS_PAYLOAD_INVALID' using errcode = '22023';
  end if;

  for entry in select * from jsonb_array_elements(p_values)
  loop
    if entry->>'key' is null or not (entry ? 'value') then
      raise exception 'SETTINGS_ENTRY_INVALID' using errcode = '22023';
    end if;

    update public.settings
       set value = entry->'value',
           updated_by = p_actor
     where key = entry->>'key';

    if not found then
      raise exception 'SETTINGS_KEY_UNKNOWN:%', entry->>'key' using errcode = '22023';
    end if;

    applied := applied + 1;
  end loop;

  return applied;
end;
$$;

comment on function public.apply_settings_batch(jsonb, uuid) is
  'Applies a whole settings form in one round trip. SECURITY INVOKER on purpose: the settings_staff_write RLS policy stays the authority on who may write.';

-- Only signed-in staff ever call this; anonymous visitors have no settings form.
revoke all on function public.apply_settings_batch(jsonb, uuid) from public, anon;
grant execute on function public.apply_settings_batch(jsonb, uuid) to authenticated, service_role;
