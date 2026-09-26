-- Panda Wok :: bootstrap staff access
--
-- `staff` is the only source of privilege in this schema: every admin RLS
-- policy resolves through `current_staff_role()`, which reads this table. A
-- fresh database therefore has no staff at all, so `/admin` is unreachable and
-- the whole admin/CRM surface is dead code until someone is promoted by hand.
--
-- Signup cannot be allowed to do this (a public signup that granted a role
-- would be a privilege-escalation hole), so the first staff row has to come
-- from the database. This migration creates it for the founding account.
--
-- Deliberately keyed on the account's email so it is a one-shot bootstrap: it
-- is idempotent, it promotes exactly one known account, and it does nothing if
-- that account does not exist yet. Promote everyone else from the CRM.
do $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.email = 'yk445kauod@gmail.com'
  limit 1;

  if v_user_id is null then
    raise notice 'Bootstrap owner account not present; skipping staff seed.';
    return;
  end if;

  insert into public.staff (user_id, role, display_name)
  values (v_user_id, 'owner', 'Yousef Khamis Ebrahim')
  on conflict (user_id) do nothing;
end;
$$;
