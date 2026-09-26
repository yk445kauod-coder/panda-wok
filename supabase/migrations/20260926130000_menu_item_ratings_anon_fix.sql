-- Panda Wok :: fix the ratings view so anonymous visitors can actually see it
--
-- `20260926120000_menu_item_ratings.sql` created the view `security_invoker`,
-- on the stated assumption that "all three base tables expose a public read
-- path". They do not. Verified against the live database:
--
--   feedback    -> only `feedback_self_read` (user_id = auth.uid())
--                  and `feedback_staff_read` (can_manage_feedback()).
--                  Both are `authenticated`-only. No anon policy exists.
--   orders      -> only `orders_owner_read` / `orders_staff_read`, both
--                  `authenticated`-only. No anon policy exists.
--
-- So under invoker rights the view is evaluated as `anon`, every row is
-- filtered out by RLS, and it returns an empty set with HTTP 200 — no error,
-- nothing logged, the star simply never appears. The menu is read anonymously
-- by every customer, so the feature was dead on arrival.
--
-- The fix is to evaluate the view with the *owner's* rights. That is safe here
-- because the view is an aggregate-only projection: it selects a menu item id,
-- a rounded average and a count, and nothing else. It exposes no user id, no
-- order id, no comment, no title — none of the row-level data the RLS policies
-- on `feedback`/`orders` are there to protect. Widening access to a rounded
-- average over rows the caller may not read is a different thing from widening
-- access to the rows.
--
-- The two honesty conditions from the original migration are unchanged:
-- only `is_public` feedback (the customer's publish consent) and only ratings
-- tied to an order. Note that `is_public` is enforced by the view's own WHERE
-- clause rather than by RLS, since a definer view does not consult RLS — so
-- this clause is now load-bearing, not belt-and-braces.
--
-- A tempting alternative — adding an anon SELECT policy on `feedback` — is
-- wrong: it would hand every anonymous visitor the raw review text, user ids
-- and image URLs. The aggregate is the whole of what is being published.

drop view if exists public.menu_item_ratings;

create view public.menu_item_ratings
with (security_invoker = false)
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
  'Per-dish star average over customer-consented (feedback.is_public) ratings tied to an order. Aggregate-only projection, deliberately evaluated with the owner''s rights: feedback/orders have no anon read policy, so an invoker-rights view returns nothing for the anonymous menu visitor. Exposes no row-level data. Empty until real feedback exists; the menu shows no stars rather than a placeholder.';

grant select on public.menu_item_ratings to anon, authenticated;
