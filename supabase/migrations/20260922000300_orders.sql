-- Panda Wok :: addresses, orders, state machine, idempotency

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Home',
  contact_name text,
  contact_phone text,
  address_line text not null,
  building text,
  floor text,
  apartment text,
  landmark text,
  area text,
  city text default 'Alexandria',
  notes text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  accuracy_m numeric(8, 2),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on addresses (user_id, is_default desc);

create unique index addresses_one_default_idx
  on addresses (user_id) where is_default;

create trigger addresses_touch before update on addresses
  for each row execute function public.touch_updated_at();

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  idempotency_key text not null,
  user_id uuid not null references auth.users (id) on delete restrict,
  status order_status not null default 'new',
  fulfillment fulfillment_type not null default 'delivery',
  payment_method payment_method not null default 'cash_on_delivery',
  payment_status payment_status not null default 'unpaid',
  currency text not null default 'EGP',
  subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
  discount_total numeric(10, 2) not null default 0 check (discount_total >= 0),
  delivery_fee numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  tax_total numeric(10, 2) not null default 0 check (tax_total >= 0),
  total numeric(10, 2) not null default 0 check (total >= 0),
  points_redeemed int not null default 0 check (points_redeemed >= 0),
  points_earned int not null default 0 check (points_earned >= 0),
  -- snapshot of delivery details so later address edits never mutate history
  address_snapshot jsonb,
  customer_note text,
  eta_minutes int,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  prepared_at timestamptz,
  dispatched_at timestamptz,
  finished_at timestamptz,
  canceled_at timestamptz
);
create index orders_user_idx on orders (user_id, created_at desc);
create index orders_status_idx on orders (status, created_at desc);
create index orders_created_idx on orders (created_at desc);
create unique index orders_idempotency_idx on orders (user_id, idempotency_key);

create trigger orders_touch before update on orders
  for each row execute function public.touch_updated_at();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  menu_item_id uuid references menu_items (id) on delete set null,
  name_snapshot text not null,
  name_ar_snapshot text,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  quantity int not null check (quantity > 0 and quantity <= 100),
  line_total numeric(10, 2) not null check (line_total >= 0),
  modifiers jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
create index order_items_order_idx on order_items (order_id);
create index order_items_menu_idx on order_items (menu_item_id);

create table order_status_history (
  id bigserial primary key,
  order_id uuid not null references orders (id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_by_role staff_role,
  note text,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on order_status_history (order_id, created_at);

-- Append-only record of every status transition, with an admin note field.
create or replace function public.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_by_role)
    values (new.id, null, new.status, new.user_id, null);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_by_role)
    values (new.id, old.status, new.status, auth.uid(), public.current_staff_role());
    if new.status = 'accepted' then new.accepted_at = coalesce(new.accepted_at, now());
    elsif new.status = 'prepared' then new.prepared_at = coalesce(new.prepared_at, now());
    elsif new.status = 'out_for_delivery' then new.dispatched_at = coalesce(new.dispatched_at, now());
    elsif new.status = 'finished' then new.finished_at = coalesce(new.finished_at, now());
    elsif new.status in ('canceled', 'rejected', 'failed', 'refunded') then
      new.canceled_at = coalesce(new.canceled_at, now());
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_status_log
  before insert or update of status on orders
  for each row execute function public.log_order_status();

-- Orders are only editable while they are still actionable by the kitchen.
create or replace function public.order_is_editable(s order_status)
returns boolean
language sql immutable
as $$
  select s in ('new', 'accepted', 'in_progress');
$$;
