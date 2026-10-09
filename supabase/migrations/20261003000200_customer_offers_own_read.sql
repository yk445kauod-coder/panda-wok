-- A signed-in customer may read a promotion targeted at them, and only them.
-- Without this, `getCheckoutConfig` (running as the customer's own session)
-- could not see their personal offer, so the checkout preview and the invoice
-- would omit a discount `place_order` actually applies.
--
-- The rule is `customer_id = auth.uid()`: an anonymous visitor has a null uid
-- and matches nothing here, so personal offers stay unbrowsable. This ORs with
-- the existing public/untargeted policy, it does not replace it.
create policy offers_own_read on offers
  for select to authenticated
  using (
    is_enabled
    and customer_id = auth.uid()
    and restaurant_id = public.current_restaurant_id()
  );
