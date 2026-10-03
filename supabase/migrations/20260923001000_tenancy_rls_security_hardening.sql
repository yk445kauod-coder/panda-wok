-- Panda Wok :: tenancy enforcement + FK indexes + definer lockdown
--
-- Task 1 (tenancy/restaurant_id): the restaurant_id columns existed and were
-- indexed since 011, but no RLS policy referenced them - the app never filters
-- by tenant. This enforces tenancy at the RLS layer so future rows cannot leak
-- across restaurants, and flips the previously-unused restaurant indexes into
-- the hot path.
--
-- Task 2 (RLS/performance/security): cover the 28 foreign keys Postgres cannot
-- use yet, lock down the SECURITY DEFINER helpers that no client needs, and
-- move pg_trgm into the extensions schema.

begin;

-- 1) Cover the remaining unindexed foreign keys
create index if not exists ai_prompts_updated_by_idx on public.ai_prompts (updated_by);
create index if not exists ai_requests_user_id_idx on public.ai_requests (user_id);
create index if not exists analytics_events_user_id_idx on public.analytics_events (user_id);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists backup_records_created_by_idx on public.backup_records (created_by);
create index if not exists broadcasts_confirmed_by_idx on public.broadcasts (confirmed_by);
create index if not exists broadcasts_created_by_idx on public.broadcasts (created_by);
create index if not exists conversations_assigned_to_idx on public.conversations (assigned_to);
create index if not exists conversations_related_order_id_idx on public.conversations (related_order_id);
create index if not exists exports_requested_by_idx on public.exports (requested_by);
create index if not exists feedback_responded_by_idx on public.feedback (responded_by);
create index if not exists loyalty_redemptions_order_id_idx on public.loyalty_redemptions (order_id);
create index if not exists loyalty_redemptions_reward_id_idx on public.loyalty_redemptions (reward_id);
create index if not exists loyalty_redemptions_user_id_idx on public.loyalty_redemptions (user_id);
create index if not exists loyalty_rewards_menu_item_id_idx on public.loyalty_rewards (menu_item_id);
create index if not exists loyalty_transactions_created_by_idx on public.loyalty_transactions (created_by);
create index if not exists loyalty_transactions_order_id_idx on public.loyalty_transactions (order_id);
create index if not exists menu_item_stock_stock_item_id_idx on public.menu_item_stock (stock_item_id);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists modifier_groups_menu_item_id_idx on public.modifier_groups (menu_item_id);
create index if not exists modifier_options_group_id_idx on public.modifier_options (group_id);
create index if not exists notifications_broadcast_id_idx on public.notifications (broadcast_id);
create index if not exists order_status_history_changed_by_idx on public.order_status_history (changed_by);
create index if not exists settings_updated_by_idx on public.settings (updated_by);
create index if not exists stock_movements_created_by_idx on public.stock_movements (created_by);
create index if not exists stock_movements_order_id_idx on public.stock_movements (order_id);
create index if not exists upsell_rules_suggest_category_id_idx on public.upsell_rules (suggest_category_id);
create index if not exists upsell_rules_suggest_menu_item_id_idx on public.upsell_rules (suggest_menu_item_id);

-- 2) Enforce tenancy through RLS (defense in depth for future tenants).
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (is_enabled and restaurant_id = public.current_restaurant_id());

drop policy if exists categories_staff_read on public.categories;
create policy categories_staff_read on public.categories
  for select to authenticated
  using (is_staff() and restaurant_id = public.current_restaurant_id());

drop policy if exists categories_staff_write on public.categories;
create policy categories_staff_write on public.categories
  for all to authenticated
  using (has_role('manager'::staff_role) and restaurant_id = public.current_restaurant_id())
  with check (has_role('manager'::staff_role) and restaurant_id = public.current_restaurant_id());

drop policy if exists menu_items_public_read on public.menu_items;
create policy menu_items_public_read on public.menu_items
  for select to anon, authenticated
  using (restaurant_id = public.current_restaurant_id());

drop policy if exists menu_items_staff_write on public.menu_items;
create policy menu_items_staff_write on public.menu_items
  for all to authenticated
  using (has_role('manager'::staff_role) and restaurant_id = public.current_restaurant_id())
  with check (has_role('manager'::staff_role) and restaurant_id = public.current_restaurant_id());

drop policy if exists orders_staff_read on public.orders;
create policy orders_staff_read on public.orders
  for select to authenticated
  using (is_staff() and restaurant_id = public.current_restaurant_id());

drop policy if exists orders_staff_update on public.orders;
create policy orders_staff_update on public.orders
  for update to authenticated
  using (can_manage_orders() and restaurant_id = public.current_restaurant_id())
  with check (can_manage_orders() and restaurant_id = public.current_restaurant_id());

drop policy if exists profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles
  for select to authenticated
  using (is_staff() and restaurant_id = public.current_restaurant_id());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for update to authenticated
  using (has_role('manager'::staff_role) and restaurant_id = public.current_restaurant_id())
  with check (has_role('manager'::staff_role) and restaurant_id = public.current_restaurant_id());

-- 3) Lock down SECURITY DEFINER functions.
-- Helpers the RLS policies and the app honour are kept for authenticated
-- sessions; anon keeps only what public menu reads require.
revoke execute on function public.current_restaurant_id() from public;
grant execute on function public.current_restaurant_id() to anon, authenticated;

revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

revoke execute on function public.has_role(staff_role) from public, anon;
grant execute on function public.has_role(staff_role) to authenticated;

revoke execute on function public.can_manage_orders() from public, anon;
grant execute on function public.can_manage_orders() to authenticated;

revoke execute on function public.can_manage_feedback() from public, anon;
grant execute on function public.can_manage_feedback() to authenticated;

revoke execute on function public.can_manage_marketing() from public, anon;
grant execute on function public.can_manage_marketing() to authenticated;

-- Internal-only: reached through definer functions and triggers, so the HTTP
-- surface is closed entirely.
revoke all on function public.current_staff_role() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.can_broadcast() from public, anon, authenticated;
revoke all on function public.can_export() from public, anon, authenticated;
revoke all on function public.can_backup() from public, anon, authenticated;
revoke all on function public.clawback_loyalty_on_failure() from public, anon, authenticated;

-- 4) Extensions belong in the extensions schema (Supabase convention).
do $$
begin
  alter extension pg_trgm set schema extensions;
exception
  when others then
    raise notice 'pg_trgm schema move skipped: %', sqlerrm;
end;
$$;

commit;
