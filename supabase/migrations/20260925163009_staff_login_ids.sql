-- Panda Wok :: staff login IDs
--
-- The ops console is opened with a single credential: either the shared ops
-- passcode (full owner access) or a staff member's `login_id` (access limited
-- to that member's role). A `login_id` is whatever the owner hands the worker —
-- a mobile number, a short code, an employee number — so it is a free-form
-- unique string rather than a UUID or an email.
--
-- The id is stored lower-cased through a unique functional index so lookups are
-- case-insensitive without a second normalised column. `login_id` is nullable:
-- the founding owner account has no id and keeps working through the passcode.

alter table public.staff
  add column if not exists login_id text;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'staff_login_id_key'
  ) then
    create unique index staff_login_id_key
      on public.staff (lower(login_id))
      where login_id is not null;
  end if;
end;
$$;

comment on column public.staff.login_id is
  'Credential the worker types at /admin to open the console with this role. Free-form unique string (phone, short code, employee number).';
