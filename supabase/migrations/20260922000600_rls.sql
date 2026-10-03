-- Panda Wok :: row level security, storage buckets, function grants
-- Default posture: nothing is readable or writable unless a policy allows it.
-- Public read is limited to explicitly public content (menu, brand settings).
-- All aggregate/reporting functions are service-role only so a signed-in
-- customer can never enumerate other customers.

-- Role helpers for policies. These are additive to has_role() so a role can
-- grant a capability to a peer without widening the whole hierarchy.
create or replace function public.can_manage_orders()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_staff_role() in ('owner', 'admin', 'manager', 'kitchen', 'support');
$$;

create or replace function public.can_manage_feedback()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_staff_role() in ('owner', 'admin', 'manager', 'support');
$$;

create or replace function public.can_manage_marketing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_staff_role() in ('owner', 'admin', 'manager', 'marketing');
$$;

alter table profiles enable row level security;
alter table staff enable row level security;
alter table settings enable row level security;
alter table feature_flags enable row level security;
alter table audit_logs enable row level security;
alter table restaurants enable row level security;
alter table categories enable row level security;
alter table menu_items enable row level security;
alter table menu_images enable row level security;
alter table modifier_groups enable row level security;
alter table modifier_options enable row level security;
alter table upsell_rules enable row level security;
alter table addresses enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table stock_items enable row level security;
alter table stock_movements enable row level security;
alter table menu_item_stock enable row level security;
alter table loyalty_accounts enable row level security;
alter table loyalty_transactions enable row level security;
alter table loyalty_rewards enable row level security;
alter table loyalty_redemptions enable row level security;
alter table feedback enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table broadcasts enable row level security;
alter table broadcast_recipients enable row level security;
alter table notifications enable row level security;
alter table activity_logs enable row level security;
alter table analytics_events enable row level security;
alter table exports enable row level security;
alter table backup_records enable row level security;
alter table ai_providers enable row level security;
alter table ai_prompts enable row level security;
alter table ai_knowledge_sources enable row level security;
alter table ai_requests enable row level security;
alter table ai_usage_daily enable row level security;

-- ------------------------------------------------------------ catalogue (public read)

create policy restaurants_public_read on restaurants
  for select to anon, authenticated using (is_active);
create policy restaurants_staff_write on restaurants
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy categories_public_read on categories
  for select to anon, authenticated using (is_enabled);
create policy categories_staff_read on categories
  for select to authenticated using (public.is_staff());
create policy categories_staff_write on categories
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy menu_items_public_read on menu_items
  for select to anon, authenticated using (true);
create policy menu_items_staff_write on menu_items
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy menu_images_public_read on menu_images
  for select to anon, authenticated using (true);
create policy menu_images_staff_write on menu_images
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy modifier_groups_public_read on modifier_groups
  for select to anon, authenticated using (true);
create policy modifier_groups_staff_write on modifier_groups
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy modifier_options_public_read on modifier_options
  for select to anon, authenticated using (true);
create policy modifier_options_staff_write on modifier_options
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy upsell_rules_public_read on upsell_rules
  for select to anon, authenticated using (is_enabled);
create policy upsell_rules_staff_write on upsell_rules
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

-- ------------------------------------------------------------ settings & flags

create policy settings_public_read on settings
  for select to anon, authenticated using (is_public);
create policy settings_staff_read on settings
  for select to authenticated using (public.is_staff());
create policy settings_staff_write on settings
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy feature_flags_public_read on feature_flags
  for select to anon, authenticated using (true);
create policy feature_flags_staff_write on feature_flags
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- ------------------------------------------------------------ identity

create policy profiles_self_read on profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_self_update on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_staff_read on profiles
  for select to authenticated using (public.is_staff());
create policy profiles_admin_write on profiles
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy staff_self_read on staff
  for select to authenticated using (user_id = auth.uid());
create policy staff_owner_manage on staff
  for all to authenticated using (public.has_role('owner')) with check (public.has_role('owner'));
create policy staff_admin_read on staff
  for select to authenticated using (public.is_staff());

create policy audit_logs_staff_read on audit_logs
  for select to authenticated using (public.is_staff());
create policy audit_logs_staff_insert on audit_logs
  for insert to authenticated with check (public.is_staff() and actor_id = auth.uid());

-- ------------------------------------------------------------ addresses

create policy addresses_owner on addresses
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------ orders

create policy orders_owner_read on orders
  for select to authenticated using (user_id = auth.uid());
create policy orders_staff_read on orders
  for select to authenticated using (public.is_staff());
create policy orders_staff_update on orders
  for update to authenticated
  using (public.can_manage_orders())
  with check (public.can_manage_orders());

create policy order_items_owner_read on order_items
  for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));

create policy order_status_history_owner_read on order_status_history
  for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));

-- ------------------------------------------------------------ stock (internal only)

create policy stock_items_staff_read on stock_items
  for select to authenticated using (public.is_staff());
create policy stock_items_manager_write on stock_items
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy stock_movements_staff_read on stock_movements
  for select to authenticated using (public.is_staff());
create policy stock_movements_staff_insert on stock_movements
  for insert to authenticated with check (public.can_manage_orders() and created_by = auth.uid());
create policy menu_item_stock_staff_read on menu_item_stock
  for select to authenticated using (public.is_staff());
create policy menu_item_stock_manager_write on menu_item_stock
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

-- ------------------------------------------------------------ loyalty

create policy loyalty_accounts_self_read on loyalty_accounts
  for select to authenticated using (user_id = auth.uid());
create policy loyalty_accounts_staff_read on loyalty_accounts
  for select to authenticated using (public.is_staff());
create policy loyalty_accounts_manager_write on loyalty_accounts
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy loyalty_txn_self_read on loyalty_transactions
  for select to authenticated using (user_id = auth.uid());
create policy loyalty_txn_staff_read on loyalty_transactions
  for select to authenticated using (public.is_staff());
create policy loyalty_txn_manager_write on loyalty_transactions
  for insert to authenticated with check (public.has_role('manager'));

create policy loyalty_rewards_public_read on loyalty_rewards
  for select to anon, authenticated using (is_enabled);
create policy loyalty_rewards_staff_read on loyalty_rewards
  for select to authenticated using (public.is_staff());
create policy loyalty_rewards_manager_write on loyalty_rewards
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy loyalty_redemptions_self_read on loyalty_redemptions
  for select to authenticated using (user_id = auth.uid());
create policy loyalty_redemptions_staff_read on loyalty_redemptions
  for select to authenticated using (public.is_staff());
create policy loyalty_redemptions_manager_write on loyalty_redemptions
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

-- ------------------------------------------------------------ feedback

create policy feedback_self_insert on feedback
  for insert to authenticated with check (user_id = auth.uid());
create policy feedback_self_read on feedback
  for select to authenticated using (user_id = auth.uid());
create policy feedback_staff_read on feedback
  for select to authenticated using (public.can_manage_feedback());
create policy feedback_staff_update on feedback
  for update to authenticated
  using (public.can_manage_feedback()) with check (public.can_manage_feedback());

-- ------------------------------------------------------------ conversations

create policy conversations_participant_read on conversations
  for select to authenticated using (user_id = auth.uid() or public.can_manage_feedback());
create policy conversations_self_insert on conversations
  for insert to authenticated with check (user_id = auth.uid());
create policy conversations_staff_update on conversations
  for update to authenticated using (public.can_manage_feedback()) with check (public.can_manage_feedback());

create policy messages_participant_read on messages
  for select to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id and (c.user_id = auth.uid() or public.can_manage_feedback())
  ));
create policy messages_self_insert on messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id
        and (c.user_id = auth.uid() or public.can_manage_feedback())
    )
    -- internal notes are staff-only
    and (not is_internal_note or public.is_staff())
  );

-- ------------------------------------------------------------ broadcasts

create policy broadcasts_marketing_read on broadcasts
  for select to authenticated using (public.can_manage_marketing());
create policy broadcasts_marketing_write on broadcasts
  for all to authenticated using (public.can_manage_marketing()) with check (public.can_manage_marketing());

create policy broadcast_recipients_self_read on broadcast_recipients
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create policy notifications_self on notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_self_update on notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------ activity & analytics

create policy activity_logs_self_insert on activity_logs
  for insert to authenticated with check (user_id = auth.uid());
create policy activity_logs_staff_read on activity_logs
  for select to authenticated using (public.is_staff());

create policy analytics_events_open_insert on analytics_events
  for insert to anon, authenticated with check (true);
create policy analytics_events_staff_read on analytics_events
  for select to authenticated using (public.is_staff());

-- ------------------------------------------------------------ ops

create policy exports_manager on exports
  for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy backup_records_manager_read on backup_records
  for select to authenticated using (public.has_role('manager'));
create policy backup_records_manager_insert on backup_records
  for insert to authenticated with check (public.has_role('manager'));
-- Restores are owner-only and always require an explicit confirmation token,
-- so no update/delete policy is granted here.

-- ------------------------------------------------------------ AI

create policy ai_providers_admin on ai_providers
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy ai_prompts_admin on ai_prompts
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy ai_knowledge_admin on ai_knowledge_sources
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy ai_requests_staff_read on ai_requests
  for select to authenticated using (public.has_role('admin'));
create policy ai_usage_staff_read on ai_usage_daily
  for select to authenticated using (public.has_role('admin'));

-- ------------------------------------------------------------ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('menu-images', 'menu-images', true, 8388608,
   array['image/png','image/jpeg','image/webp','image/avif']),
  ('feedback-attachments', 'feedback-attachments', false, 5242880,
   array['image/png','image/jpeg','image/webp']),
  ('exports', 'exports', false, 104857600, null),
  ('backups', 'backups', false, 524288000, null)
on conflict (id) do nothing;

create policy storage_menu_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'menu-images');
create policy storage_menu_staff_write on storage.objects
  for insert to authenticated with check (bucket_id = 'menu-images' and public.has_role('manager'));
create policy storage_menu_staff_update on storage.objects
  for update to authenticated using (bucket_id = 'menu-images' and public.has_role('manager'));
create policy storage_menu_staff_delete on storage.objects
  for delete to authenticated using (bucket_id = 'menu-images' and public.has_role('manager'));

create policy storage_feedback_self_write on storage.objects
  for insert to authenticated with check (bucket_id = 'feedback-attachments');
create policy storage_feedback_read on storage.objects
  for select to authenticated using (bucket_id = 'feedback-attachments' and public.can_manage_feedback());

-- Private artefacts: only staff can read them; all writes go through the
-- server with the service role so a client cannot forge a backup/exports path.
create policy storage_exports_read on storage.objects
  for select to authenticated using (bucket_id = 'exports' and public.has_role('manager'));
create policy storage_backups_read on storage.objects
  for select to authenticated using (bucket_id = 'backups' and public.has_role('owner'));

-- ------------------------------------------------------------ function grants

-- Public/authenticated surface: menu reads happen through RLS-protected
-- tables, so no definer function is exposed except the ones that are safe.
revoke all on function public.crm_customers(text, int, int) from public, anon, authenticated;
revoke all on function public.crm_segment(text, int) from public, anon, authenticated;
revoke all on function public.crm_estimate_segment(text, int) from public, anon, authenticated;
revoke all on function public.crm_ordered_item(uuid) from public, anon, authenticated;
revoke all on function public.recompute_stock_status(uuid) from public, anon, authenticated;
revoke all on function public.setting_numeric(text, numeric) from public, anon, authenticated;
revoke all on function public.next_order_number() from public, anon, authenticated;
revoke all on function public.log_order_status() from public, anon, authenticated;
revoke all on function public.award_loyalty_on_finish() from public, anon, authenticated;
revoke all on function public.apply_stock_movement() from public, anon, authenticated;
revoke all on function public.bump_conversation() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Customers may only create orders through place_order, which re-validates
-- everything server-side and enforces idempotency for the caller.
revoke all on function public.place_order(text, jsonb, uuid, fulfillment_type, payment_method, text, int) from public, anon;
grant execute on function public.place_order(text, jsonb, uuid, fulfillment_type, payment_method, text, int) to authenticated;
