-- Panda Wok :: per-dish rating aggregate
--
-- The customer menu shows a star rating on each dish card. It has to be a real
-- number: the brand rule for this project is that nothing visitor-facing is
-- invented, and a hardcoded "4.9" on a kitchen with no orders is exactly the
-- kind of fabricated social proof the baseline audit forbids.
--
-- So the rating is computed from what the database actually holds:
--
--   feedback.rating  ->  the star score a customer left for an order
--   feedback.order_id -> orders.id -> order_items.menu_item_id -> menu_items.id
--
-- Two conditions keep it honest:
--
--   1. `feedback.is_public` must be true. That column already means "the
--      customer consented to this being shown". Aggregating a score is a weaker
--      disclosure than quoting the review, but consenting to publish is the
--      closest honest signal we have, and defaulting to `false` means an
--      un-consented rating never influences a public average.
--   2. `feedback.order_id` must be present. A rating with no order cannot be
--      attributed to a dish at all.
--
-- The view is `security_invoker`, so it is evaluated with the *caller's* rights
-- and the RLS policies on feedback/orders/order_items still apply. The anon
-- role can therefore read the aggregate (all three base tables expose a public
-- read path) without the view becoming a hole through RLS. Nothing is widened:
-- a customer who can already see the menu can now see an average over rows
-- they were already permitted to read.
--
-- Note the deliberate absence of a `review_count` threshold. The cards render
-- the rating only when `rating_count > 0`, and show the count beside it, so a
-- single honest 5.0 is labelled as "1 rating" rather than passed off as a
-- established score. Adding a threshold here would silently hide small
-- kitchens instead of labelling them.

create or replace view public.menu_item_ratings
with (security_invoker = true)
as
select
  oi.menu_item_id,
  round(avg(f.rating)::numeric, 1) as average_rating,
  count(*)::int                    as rating_count
from public.feedback f
join public.orders o       on o.id = f.order_id
join public.order_items oi on oi.order_id = o.id
where f.is_public
  and f.order_id is not null
  and oi.menu_item_id is not null
group by oi.menu_item_id;

comment on view public.menu_item_ratings is
  'Per-dish star average over customer-consented (feedback.is_public) ratings that are tied to an order. Empty until real feedback exists; the menu shows no stars rather than a placeholder.';

-- The view is read by slug/id lookups on every menu render, so the join columns
-- are indexed. `feedback(order_id)` is the one that matters: the other two are
-- already indexed (order_items.order_id, order_items.menu_item_id).
create index if not exists feedback_order_id_idx on public.feedback (order_id);

grant select on public.menu_item_ratings to anon, authenticated;
