-- Panda Wok :: RLS initplan optimisation
--
-- Policies that call auth.uid() / auth.<fn>() directly re-evaluate the function
-- for every row. Wrapping the call in a subselect lets Postgres evaluate it once
-- (an InitPlan) and reuse the result, which the Supabase linter flags as the
-- intended form. Behaviour is identical: the compared value is the same uid.
--
-- Only the policies that compare against the current user are rewritten here;
-- the capability helpers (is_staff(), has_role(), …) are already STABLE and are
-- left as-is to keep this change focused.

begin;

-- profiles
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- staff
drop policy if exists staff_self_read on public.staff;
create policy staff_self_read on public.staff
  for select to authenticated using (user_id = (select auth.uid()));

-- audit_logs
drop policy if exists audit_logs_staff_insert on public.audit_logs;
create policy audit_logs_staff_insert on public.audit_logs
  for insert to authenticated
  with check (public.is_staff() and actor_id = (select auth.uid()));

-- addresses
drop policy if exists addresses_owner on public.addresses;
create policy addresses_owner on public.addresses
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- orders
drop policy if exists orders_owner_read on public.orders;
create policy orders_owner_read on public.orders
  for select to authenticated using (user_id = (select auth.uid()));

-- order_items
drop policy if exists order_items_owner_read on public.order_items;
create policy order_items_owner_read on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_staff())
  ));

-- order_status_history
drop policy if exists order_status_history_owner_read on public.order_status_history;
create policy order_status_history_owner_read on public.order_status_history
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_staff())
  ));

-- stock_movements
drop policy if exists stock_movements_staff_insert on public.stock_movements;
create policy stock_movements_staff_insert on public.stock_movements
  for insert to authenticated
  with check (public.can_manage_orders() and created_by = (select auth.uid()));

-- loyalty
drop policy if exists loyalty_accounts_self_read on public.loyalty_accounts;
create policy loyalty_accounts_self_read on public.loyalty_accounts
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists loyalty_txn_self_read on public.loyalty_transactions;
create policy loyalty_txn_self_read on public.loyalty_transactions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists loyalty_redemptions_self_read on public.loyalty_redemptions;
create policy loyalty_redemptions_self_read on public.loyalty_redemptions
  for select to authenticated using (user_id = (select auth.uid()));

-- feedback
drop policy if exists feedback_self_insert on public.feedback;
create policy feedback_self_insert on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists feedback_self_read on public.feedback;
create policy feedback_self_read on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));

-- conversations
drop policy if exists conversations_participant_read on public.conversations;
create policy conversations_participant_read on public.conversations
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_feedback());

drop policy if exists conversations_self_insert on public.conversations;
create policy conversations_self_insert on public.conversations
  for insert to authenticated with check (user_id = (select auth.uid()));

-- messages
drop policy if exists messages_participant_read on public.messages;
create policy messages_participant_read on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.user_id = (select auth.uid()) or public.can_manage_feedback())
  ));

drop policy if exists messages_self_insert on public.messages;
create policy messages_self_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.user_id = (select auth.uid()) or public.can_manage_feedback())
    )
    and (not is_internal_note or public.is_staff())
  );

-- broadcast_recipients
drop policy if exists broadcast_recipients_self_read on public.broadcast_recipients;
create policy broadcast_recipients_self_read on public.broadcast_recipients
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

-- notifications
drop policy if exists notifications_self on public.notifications;
create policy notifications_self on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- activity_logs
drop policy if exists activity_logs_self_insert on public.activity_logs;
create policy activity_logs_self_insert on public.activity_logs
  for insert to authenticated with check (user_id = (select auth.uid()));

commit;
