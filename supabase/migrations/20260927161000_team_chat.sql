-- Internal team chat: staff talking to each other, separate from the customer
-- conversation tables.
--
-- `conversations`/`messages` are customer-scoped: `conversations.user_id` is a
-- foreign key to a customer and RLS is owner-based, so a staff member can only
-- see a thread they are the customer on. Reusing them for staff-to-staff chat
-- would mean either relaxing that RLS (a real leak risk) or misusing the
-- customer column. These are separate tables with staff-only policies.
--
-- Shape: a small set of channels every active staff member belongs to, plus
-- 1:1 direct threads between two staff members. Channels are auto-joined; a DM
-- is joined by its two participants when it is created.

create table if not exists public.team_threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('channel', 'dm')),
  name text not null,
  slug text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.team_thread_members (
  thread_id uuid not null references public.team_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists team_thread_members_user_idx
  on public.team_thread_members (user_id, thread_id);

create table if not exists public.team_messages (
  id bigserial primary key,
  thread_id uuid not null references public.team_threads (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists team_messages_thread_idx
  on public.team_messages (thread_id, created_at desc);

-- --------------------------------------------------------------- membership

/** True when the caller is an active staff member and belongs to the thread. */
create or replace function public.is_team_member(p_thread uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.team_thread_members m
    join public.staff s on s.user_id = m.user_id and s.is_active
    where m.thread_id = p_thread and m.user_id = auth.uid()
  );
$$;

/** True when the caller is any active staff member (channels are staff-wide). */
create or replace function public.is_active_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff s where s.user_id = auth.uid() and s.is_active
  );
$$;

-- --------------------------------------------------------------- behaviour

/** Keeps the thread's "last activity" honest when a message lands. */
create or replace function public.touch_team_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.team_threads
  set last_message_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists team_messages_touch on public.team_messages;
create trigger team_messages_touch
  after insert on public.team_messages
  for each row execute function public.touch_team_thread();

/**
 * Creates (or returns) the 1:1 thread between the caller and one other active
 * staff member. Deterministic on the participant pair via the slug, so opening
 * a DM twice never forks the conversation.
 */
create or replace function public.open_dm(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_slug text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.is_active_staff() then
    raise exception 'not staff' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff where user_id = p_other and is_active) then
    raise exception 'not a staff member' using errcode = '22023';
  end if;
  if p_other = v_me then
    raise exception 'cannot message yourself' using errcode = '22023';
  end if;

  -- Order-independent slug so (a,b) and (b,a) resolve to one row.
  v_slug := 'dm:' || least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);

  select id into v_id from public.team_threads where slug = v_slug;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.team_threads (kind, name, slug, created_by)
  values ('dm', 'Direct message', v_slug, v_me)
  returning id into v_id;

  insert into public.team_thread_members (thread_id, user_id) values (v_id, v_me), (v_id, p_other);
  return v_id;
end;
$$;

/** Joins every active staff member to every channel. Called after a channel is created. */
create or replace function public.join_staff_to_channel(p_thread uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.team_thread_members (thread_id, user_id)
  select p_thread, s.user_id
  from public.staff s
  where s.is_active and s.user_id is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- --------------------------------------------------------------- seed channel

insert into public.team_threads (kind, name, slug)
select 'channel', 'Team', 'team'
where not exists (select 1 from public.team_threads where slug = 'team');

-- Backfill membership for existing staff and keep future staff joined to channels.
insert into public.team_thread_members (thread_id, user_id)
select t.id, s.user_id
from public.team_threads t
cross join public.staff s
where t.kind = 'channel' and s.is_active and s.user_id is not null
on conflict do nothing;

create or replace function public.join_new_staff_to_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active and new.user_id is not null then
    insert into public.team_thread_members (thread_id, user_id)
    select t.id, new.user_id from public.team_threads t where t.kind = 'channel'
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_join_channels on public.staff;
create trigger staff_join_channels
  after insert or update of is_active on public.staff
  for each row execute function public.join_new_staff_to_channels();

-- --------------------------------------------------------------- RLS

alter table public.team_threads enable row level security;
alter table public.team_thread_members enable row level security;
alter table public.team_messages enable row level security;

drop policy if exists team_threads_member_read on public.team_threads;
create policy team_threads_member_read on public.team_threads
  for select to authenticated using (public.is_team_member(id));

drop policy if exists team_threads_staff_insert on public.team_threads;
create policy team_threads_staff_insert on public.team_threads
  for insert to authenticated with check (public.is_active_staff());

drop policy if exists team_members_member_read on public.team_thread_members;
create policy team_members_member_read on public.team_thread_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_team_member(thread_id));

drop policy if exists team_members_self_write on public.team_thread_members;
create policy team_members_self_write on public.team_thread_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists team_messages_member_read on public.team_messages;
create policy team_messages_member_read on public.team_messages
  for select to authenticated using (public.is_team_member(thread_id));

drop policy if exists team_messages_member_insert on public.team_messages;
create policy team_messages_member_insert on public.team_messages
  for insert to authenticated
  with check (public.is_team_member(thread_id) and sender_id = (select auth.uid()));

-- --------------------------------------------------------------- grants

revoke all on function public.is_team_member(uuid) from public;
revoke all on function public.is_active_staff() from public;
revoke all on function public.open_dm(uuid) from public;
revoke all on function public.join_staff_to_channel(uuid) from public;

grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.open_dm(uuid) to authenticated;
grant execute on function public.join_staff_to_channel(uuid) to service_role;
