-- Staff sessions, and the RLS tightening that keeps them from widening access.
--
-- The ops console now mints a real Supabase session for the acting member when
-- they unlock it (see `mintStaffSession`), so the browser holds a token and the
-- console can go live without polling. A token means the staff browser can reach
-- PostgREST directly, so every read policy that used the coarse `is_staff()`
-- predicate is narrowed to the same capability set the console's own role matrix
-- enforces. Without this, a kitchen member's session could read settings,
-- analytics, the audit log and customer rows they cannot see in the console —
-- a privilege widening, not a refactor.
--
-- No row, column, role or capability is changed: this only makes the database
-- agree with the matrix the console already applies.

create or replace function public.can_view_analytics()
returns boolean
language sql stable security definer set search_path = 'public'
as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and s.is_active
      and s.role in ('owner', 'admin', 'manager', 'marketing')
  );
$$;

create or replace function public.can_manage_menu()
returns boolean
language sql stable security definer set search_path = 'public'
as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and s.is_active
      and s.role in ('owner', 'admin', 'manager', 'marketing')
  );
$$;

revoke execute on function public.can_view_analytics() from public, anon;
revoke execute on function public.can_manage_menu() from public, anon;
grant execute on function public.can_view_analytics() to authenticated;
grant execute on function public.can_manage_menu() to authenticated;

-- settings.manage = owner, admin
drop policy if exists settings_staff_read on public.settings;
create policy settings_staff_read on public.settings for select to authenticated
  using (has_role('admin'::staff_role));

-- analytics.view = owner, admin, manager, marketing
drop policy if exists analytics_events_staff_read on public.analytics_events;
create policy analytics_events_staff_read on public.analytics_events for select to authenticated
  using (can_view_analytics());

-- The audit log is the admin surface's own record; keep it to admin and above.
drop policy if exists audit_logs_staff_read on public.audit_logs;
create policy audit_logs_staff_read on public.audit_logs for select to authenticated
  using (has_role('admin'::staff_role));

-- The activity feed is a CRM view.
drop policy if exists activity_logs_staff_read on public.activity_logs;
create policy activity_logs_staff_read on public.activity_logs for select to authenticated
  using (can_view_crm());

-- menu.manage = owner, admin, manager, marketing
drop policy if exists categories_staff_read on public.categories;
create policy categories_staff_read on public.categories for select to authenticated
  using (can_manage_menu() and restaurant_id = current_restaurant_id());

drop policy if exists offers_staff_read on public.offers;
create policy offers_staff_read on public.offers for select to authenticated
  using (can_manage_menu() and restaurant_id = current_restaurant_id());

-- orders.view = owner, admin, manager, kitchen, support == can_manage_orders()
drop policy if exists orders_staff_read on public.orders;
create policy orders_staff_read on public.orders for select to authenticated
  using (can_manage_orders() and restaurant_id = current_restaurant_id());

drop policy if exists order_items_owner_read on public.order_items;
create policy order_items_owner_read on public.order_items for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (o.user_id = auth.uid() or can_manage_orders())
    )
  );

drop policy if exists order_status_history_owner_read on public.order_status_history;
create policy order_status_history_owner_read on public.order_status_history for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_status_history.order_id
        and (o.user_id = auth.uid() or can_manage_orders())
    )
  );

-- crm.view = owner, admin, manager, support, marketing == can_view_crm()
drop policy if exists profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles for select to authenticated
  using (can_view_crm() and restaurant_id = current_restaurant_id());

-- users.manage = owner, admin, manager
drop policy if exists staff_admin_read on public.staff;
create policy staff_admin_read on public.staff for select to authenticated
  using (has_role('manager'::staff_role));

-- The ops agent is a CRM-side tool.
drop policy if exists agent_threads_staff_read on public.agent_threads;
create policy agent_threads_staff_read on public.agent_threads for select to authenticated
  using (can_view_crm() and (owner_id is null or owner_id = auth.uid()));

drop policy if exists agent_messages_staff_read on public.agent_messages;
create policy agent_messages_staff_read on public.agent_messages for select to authenticated
  using (
    exists (
      select 1 from agent_threads t
      where t.id = agent_messages.thread_id
        and can_view_crm()
        and (t.owner_id is null or t.owner_id = auth.uid())
    )
  );
