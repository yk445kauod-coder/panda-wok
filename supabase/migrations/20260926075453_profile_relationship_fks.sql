-- Panda Wok :: profile relationships for PostgREST embeds
--
-- Every table that owns a user points `user_id` at `auth.users`, never at
-- `profiles`. PostgREST resolves `profiles (...)` embeds purely from foreign
-- keys in the exposed schema, so `orders?select=...,profiles(full_name,phone)`
-- failed with PGRST200 and took the whole admin surface with it: the order
-- queue, kitchen board, feedback inbox, messages, CRM and customer detail all
-- embed the customer profile.
--
-- The right fix is a real FK to `profiles`, not a rewrite of 13 queries: the
-- relationship is genuine (a profile row is created for every auth user by
-- handle_new_user) and the FK keeps the embed honest and indexable. `profiles`
-- is itself keyed by `auth.users(id) on delete cascade`, so deletes still
-- cascade from auth and these FKs stay consistent with it.
--
-- `on delete cascade` matches the delete rule already in place on the parent
-- link, so removing an auth user removes their orders/messages/etc. exactly as
-- before. This does not widen access: RLS is unchanged and still governs every
-- read; a FK is a data-integrity rule, not a permission.

do $$
declare
  target record;
begin
  for target in
    select * from (values
      ('orders',                'user_id',        'orders_user_id_profiles_fkey',        'cascade'),
      ('feedback',              'user_id',        'feedback_user_id_profiles_fkey',      'set null'),
      ('conversations',         'user_id',        'conversations_user_id_profiles_fkey', 'cascade'),
      ('staff',                 'user_id',        'staff_user_id_profiles_fkey',         'cascade'),
      ('loyalty_accounts',      'user_id',        'loyalty_accounts_user_id_profiles_fkey', 'cascade'),
      ('loyalty_transactions',  'user_id',        'loyalty_transactions_user_id_profiles_fkey', 'cascade'),
      ('loyalty_redemptions',   'user_id',        'loyalty_redemptions_user_id_profiles_fkey', 'cascade'),
      ('addresses',             'user_id',        'addresses_user_id_profiles_fkey',     'cascade'),
      ('notifications',         'user_id',        'notifications_user_id_profiles_fkey', 'cascade'),
      ('broadcast_recipients',  'user_id',        'broadcast_recipients_user_id_profiles_fkey', 'cascade'),
      ('analytics_events',      'user_id',        'analytics_events_user_id_profiles_fkey', 'set null'),
      ('activity_logs',         'user_id',        'activity_logs_user_id_profiles_fkey', 'set null'),
      ('ai_requests',           'user_id',        'ai_requests_user_id_profiles_fkey',   'set null')
    ) as v(tbl, col, conname, on_delete)
  loop
    -- Only add it when the column exists and the constraint is not already there.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = target.tbl and column_name = target.col
    ) and not exists (
      select 1 from pg_constraint
      where conname = target.conname and conrelid = ('public.' || quote_ident(target.tbl))::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.profiles (id) on delete %s',
        target.tbl, target.conname, target.col, target.on_delete
      );
    end if;
  end loop;
end $$;

-- The new FKs are only useful if PostgREST can plan them; these are the join
-- columns the admin screens filter and order by.
create index if not exists orders_user_id_profiles_idx on public.orders (user_id);
create index if not exists conversations_user_id_profiles_idx on public.conversations (user_id);
create index if not exists feedback_user_id_profiles_idx on public.feedback (user_id);
