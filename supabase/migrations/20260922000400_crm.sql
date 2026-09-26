-- Panda Wok :: stock, loyalty, feedback, messaging, broadcasts, activity, analytics

-- ---------------------------------------------------------------- stock

create table stock_items (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text,
  unit text not null default 'kg',
  quantity numeric(12, 3) not null default 0,
  min_threshold numeric(12, 3) not null default 0,
  cost_per_unit numeric(10, 2),
  supplier text,
  status stock_status not null default 'ok',
  auto_link_availability boolean not null default true,
  notes text,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index stock_items_status_idx on stock_items (status);

create table stock_movements (
  id bigserial primary key,
  stock_item_id uuid not null references stock_items (id) on delete cascade,
  direction stock_direction not null,
  quantity numeric(12, 3) not null,
  reason text,
  order_id uuid references orders (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_movements_item_idx on stock_movements (stock_item_id, created_at desc);

-- Which menu items depend on which stock item. When stock runs out, dependents
-- are flagged unavailable unless the admin opted out of automation.
create table menu_item_stock (
  menu_item_id uuid not null references menu_items (id) on delete cascade,
  stock_item_id uuid not null references stock_items (id) on delete cascade,
  quantity_per_unit numeric(12, 3) not null default 1,
  primary key (menu_item_id, stock_item_id)
);

create or replace function public.recompute_stock_status(item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric;
  v_min numeric;
  v_status stock_status;
begin
  select quantity, min_threshold into v_qty, v_min from stock_items where id = item_id;
  if v_qty is null then return; end if;
  v_status := case
    when v_qty <= 0 then 'out'::stock_status
    when v_qty <= v_min then 'low'::stock_status
    else 'ok'::stock_status
  end;
  update stock_items
     set status = v_status, last_updated_at = now()
   where id = item_id and status is distinct from v_status;

  update menu_items mi
     set is_available = false
   where mi.id in (select menu_item_id from menu_item_stock where stock_item_id = item_id)
     and exists (
       select 1 from menu_item_stock mis
       join stock_items si on si.id = mis.stock_item_id
       where mis.menu_item_id = mi.id
         and si.auto_link_availability
         and si.quantity <= 0
     );

  update menu_items mi
     set is_available = true
   where mi.id in (select menu_item_id from menu_item_stock where stock_item_id = item_id)
     and mi.is_available = false
     and not exists (
       select 1 from menu_item_stock mis
       join stock_items si on si.id = mis.stock_item_id
       where mis.menu_item_id = mi.id
         and si.auto_link_availability
         and si.quantity <= 0
     );
end;
$$;

create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'in' then
    update stock_items set quantity = quantity + new.quantity where id = new.stock_item_id;
  elsif new.direction = 'out' then
    update stock_items set quantity = greatest(0, quantity - new.quantity) where id = new.stock_item_id;
  else
    update stock_items set quantity = greatest(0, new.quantity) where id = new.stock_item_id;
  end if;
  perform public.recompute_stock_status(new.stock_item_id);
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on stock_movements
  for each row execute function public.apply_stock_movement();

create or replace function public.stock_quantity_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_stock_status(new.id);
  return null;
end;
$$;

create trigger stock_items_cascade
  after update of quantity on stock_items
  for each row execute function public.stock_quantity_changed();

-- ---------------------------------------------------------------- loyalty

create table loyalty_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  points_balance int not null default 0 check (points_balance >= 0),
  lifetime_points int not null default 0,
  tier loyalty_tier not null default 'bronze',
  tier_progress numeric(5, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loyalty_transactions (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid references orders (id) on delete set null,
  type loyalty_txn_type not null,
  points int not null,
  reason text,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index loyalty_txn_user_idx on loyalty_transactions (user_id, created_at desc);

create table loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text,
  description_en text,
  description_ar text,
  points_cost int not null check (points_cost > 0),
  kind text not null default 'discount_amount' check (kind in ('discount_amount', 'discount_percent', 'free_item')),
  value numeric(10, 2) not null default 0,
  menu_item_id uuid references menu_items (id) on delete set null,
  min_order_total numeric(10, 2) not null default 0,
  tier_required loyalty_tier not null default 'bronze',
  is_enabled boolean not null default true,
  stock_limit int,
  redeemed_count int not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reward_id uuid not null references loyalty_rewards (id) on delete restrict,
  order_id uuid references orders (id) on delete set null,
  points_spent int not null check (points_spent > 0),
  status text not null default 'applied' check (status in ('applied', 'canceled')),
  created_at timestamptz not null default now()
);

create trigger loyalty_accounts_touch before update on loyalty_accounts
  for each row execute function public.touch_updated_at();
create trigger loyalty_rewards_touch before update on loyalty_rewards
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- feedback

create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  order_id uuid references orders (id) on delete set null,
  rating int not null check (rating between 1 and 5),
  category feedback_category not null default 'overall',
  title text,
  message text not null,
  image_urls text[] not null default '{}',
  is_public boolean not null default false,
  status feedback_status not null default 'new',
  admin_response text,
  responded_by uuid references auth.users (id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index feedback_status_idx on feedback (status, created_at desc);
create index feedback_user_idx on feedback (user_id, created_at desc);
create index feedback_order_idx on feedback (order_id);

-- ---------------------------------------------------------------- messaging

create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text,
  status conversation_status not null default 'open',
  related_order_id uuid references orders (id) on delete set null,
  last_message_at timestamptz not null default now(),
  customer_unread int not null default 0,
  staff_unread int not null default 0,
  assigned_to uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_user_idx on conversations (user_id, last_message_at desc);
create index conversations_status_idx on conversations (status, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_kind text not null check (sender_kind in ('customer', 'staff', 'system')),
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  is_internal_note boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at);

create trigger conversations_touch before update on conversations
  for each row execute function public.touch_updated_at();

create or replace function public.bump_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversations
     set last_message_at = new.created_at,
         status = case when status = 'closed' and new.sender_kind = 'customer' then 'open'::conversation_status else status end,
         staff_unread = case when new.sender_kind = 'customer' then staff_unread + 1 else staff_unread end,
         customer_unread = case when new.sender_kind = 'staff' then customer_unread + 1 else customer_unread end
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_bump after insert on messages
  for each row execute function public.bump_conversation();

-- ---------------------------------------------------------------- broadcasts

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  channel broadcast_channel not null default 'in_app',
  segment jsonb not null default '{}'::jsonb,
  audience_label text,
  status broadcast_status not null default 'draft',
  estimated_recipients int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  confirmed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index broadcasts_status_idx on broadcasts (status, created_at desc);

create table broadcast_recipients (
  id bigserial primary key,
  broadcast_id uuid not null references broadcasts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_reason text,
  created_at timestamptz not null default now(),
  unique (broadcast_id, user_id)
);
create index broadcast_recipients_user_idx on broadcast_recipients (user_id, created_at desc);

create table notifications (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  broadcast_id uuid references broadcasts (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

-- ---------------------------------------------------------------- activity & analytics

create table activity_logs (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  session_id text,
  event text not null,
  entity text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_user_idx on activity_logs (user_id, created_at desc);
create index activity_logs_event_idx on activity_logs (event, created_at desc);

create table analytics_events (
  id bigserial primary key,
  session_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  event text not null,
  path text,
  referrer text,
  device text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index analytics_events_event_idx on analytics_events (event, created_at desc);
create index analytics_events_created_idx on analytics_events (created_at desc);

-- ---------------------------------------------------------------- ops

create table exports (
  id uuid primary key default gen_random_uuid(),
  dataset text not null,
  format export_format not null default 'csv',
  filters jsonb not null default '{}'::jsonb,
  status export_status not null default 'queued',
  row_count int,
  storage_path text,
  bytes int,
  error text,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz
);
create index exports_status_idx on exports (status, created_at desc);

create table backup_records (
  id uuid primary key default gen_random_uuid(),
  kind backup_kind not null,
  status backup_status not null default 'queued',
  label text,
  storage_path text,
  bytes int,
  manifest jsonb not null default '{}'::jsonb,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index backup_records_kind_idx on backup_records (kind, created_at desc);

-- ---------------------------------------------------------------- AI

create table ai_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'openai_compatible',
  base_url text,
  model text,
  -- secret reference name only; the value lives in server env / vault
  secret_ref text,
  is_enabled boolean not null default false,
  is_fallback boolean not null default false,
  priority int not null default 100,
  monthly_token_quota bigint,
  max_requests_per_minute int not null default 20,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ai_prompts (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  system_instruction text not null,
  temperature numeric(3, 2) not null default 0.2,
  max_tokens int not null default 700,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table ai_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'text' check (kind in ('text', 'url', 'table')),
  content text,
  url text,
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  surface text not null default 'assistant',
  prompt_key text,
  provider text,
  model text,
  latency_ms int,
  prompt_tokens int,
  completion_tokens int,
  estimated_cost numeric(10, 6),
  status text not null default 'ok' check (status in ('ok', 'fallback', 'error', 'rate_limited')),
  error text,
  created_at timestamptz not null default now()
);
create index ai_requests_created_idx on ai_requests (created_at desc);
create index ai_requests_surface_idx on ai_requests (surface, created_at desc);

create table ai_usage_daily (
  day date not null,
  provider text not null default 'all',
  requests int not null default 0,
  errors int not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  estimated_cost numeric(12, 6) not null default 0,
  primary key (day, provider)
);

create trigger ai_providers_touch before update on ai_providers
  for each row execute function public.touch_updated_at();
create trigger ai_prompts_touch before update on ai_prompts
  for each row execute function public.touch_updated_at();
create trigger ai_knowledge_sources_touch before update on ai_knowledge_sources
  for each row execute function public.touch_updated_at();
