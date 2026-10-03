-- Panda Wok :: per-customer (targeted) offers
--
-- The owner can already create a promotion that applies to everyone. This adds
-- a targeted promotion: the same rules, but scoped to one customer, so the
-- console can offer a specific person a discount (goodwill, a win-back, a VIP
-- deal) without changing the price anyone else sees.
--
-- Design notes that matter:
--
-- 1. `customer_id IS NULL` means "everyone" — exactly the previous behaviour.
--    Every existing row keeps applying as before; nothing is rewritten.
-- 2. The customer-facing read policy is narrowed to untargeted offers only, so
--    an anonymous visitor can never enumerate other people's personal deals.
--    A signed-in customer's own targeted offer is read through the service
--    role (server-side) and applied by `place_order` — it is never browsable.
-- 3. `best_offer` now also matches a row targeted at the *current* caller
--    (`auth.uid()`), so the single-best-offer rule still holds across both
--    kinds and `place_order` needs no change at all.

-- ------------------------------------------------------------- schema

alter table offers
  add column if not exists customer_id uuid
    references public.profiles (id) on delete cascade;

create index if not exists offers_customer_idx on offers (customer_id);

-- ------------------------------------------------------------- policies

-- Public read stays as it was, plus "untargeted only". An anon or customer
-- session must not see a promotion that belongs to somebody else.
drop policy if exists offers_public_read on offers;
create policy offers_public_read on offers
  for select to anon, authenticated
  using (
    is_enabled
    and customer_id is null
    and restaurant_id = public.current_restaurant_id()
  );

-- Staff still read and write every row, targeted or not.
drop policy if exists offers_staff_read on offers;
create policy offers_staff_read on offers
  for select to authenticated
  using (is_staff() and restaurant_id = public.current_restaurant_id());

drop policy if exists offers_staff_write on offers;
create policy offers_staff_write on offers
  for all to authenticated
  using (public.can_manage_offers() and restaurant_id = public.current_restaurant_id())
  with check (public.can_manage_offers() and restaurant_id = public.current_restaurant_id());

-- ------------------------------------------------------- best_offer

-- Same signature and result shape as before; the only change is the extra
-- eligibility clause. `auth.uid()` returns the *caller's* id even inside a
-- SECURITY DEFINER function (it reads the request JWT), so:
--   * a customer's own checkout matches their targeted offer,
--   * an anonymous visitor (auth.uid() null) matches only untargeted offers,
--   * the admin console never calls this for pricing.
create or replace function public.best_offer(p_subtotal numeric)
returns table (
  offer_id uuid,
  offer_name_en text,
  offer_name_ar text,
  offer_kind offer_kind,
  amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      o.id,
      o.name_en,
      o.name_ar,
      o.kind,
      o.sort_order,
      o.created_at,
      least(
        case
          when o.kind = 'percent' then round(p_subtotal * o.value / 100, 2)
          else o.value
        end,
        coalesce(o.max_discount, 1e12),
        p_subtotal
      ) as amount
    from offers o
    where o.is_enabled
      and o.restaurant_id = public.current_restaurant_id()
      and (o.customer_id is null or o.customer_id = auth.uid())
      and p_subtotal >= o.threshold
  )
  select c.id, c.name_en, c.name_ar, c.kind, c.amount
  from candidates c
  where c.amount > 0
  order by c.amount desc, c.sort_order asc, c.created_at asc
  limit 1;
$$;
