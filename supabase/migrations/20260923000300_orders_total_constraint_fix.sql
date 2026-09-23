-- Panda Wok :: orders total-consistency constraint fix
--
-- The live table carries `orders_total_consistency_check` as:
--   CHECK (total = round(subtotal - discount_total + delivery_fee + tax_total))
-- `round()` with a single argument rounds to the nearest INTEGER, so the check
-- only passes when the total happens to be a whole number. Every real order has
-- fractional piastres (14% VAT on EGP prices), so the constraint rejected every
-- insert — place_order always failed with "orders_total_consistency_check".
--
-- Re-create the constraint with the intended scale (2 decimal places), matching
-- the rounding place_order itself applies to total.

begin;

alter table public.orders drop constraint if exists orders_total_consistency_check;

alter table public.orders add constraint orders_total_consistency_check
  check (total = round(subtotal - discount_total + delivery_fee + tax_total, 2));

commit;
