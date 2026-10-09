-- Panda Wok :: a choice that exists is a choice that must be made
--
-- The owner's rule, stated plainly: any item that offers a choice (a sauce, a
-- rice-or-noodles base, a protein, a size, a piece count, steamed-or-fried) must
-- make that choice mandatory. A radio the customer can skip is a radio that
-- silently produces an order the kitchen cannot cook as intended.
--
-- The earlier fix (20261009000200_require_all_modifier_choices) made every group
-- that declared a *minimum* required. Three single-select groups still slipped
-- through because they declared no minimum at all:
--
--   * Chicken            -> "Choose your style" (4 sauces)
--   * Beef               -> "Choose your style" (3 sauces)
--   * Beef dumplings (4) -> "Choose your style" (steamed / fried)
--
-- `place_order` only enforces `is_required and chosen < min_select`, so with
-- min_select = 0 nothing was enforced and a customer could order "Chicken" with
-- no sauce at all (live proof: order item "Chicken", 2026-10-04, modifiers: []).
--
-- Two changes, both additive and idempotent:
--   1. make every single-select group (max_select = 1) mandatory, so there is no
--      "pick one, or none" group left — a single-select group is a question with
--      exactly one right answer per customer;
--   2. add a CHECK constraint so the incoherent state (required without a
--      minimum, or a minimum without required) cannot be written again by any
--      future import or manual edit.
--
-- No group, option, name, price or ordering is changed. Nothing is deleted.

begin;

-- 1. A single-select group is a radio: it asks exactly one answer. So its
--    minimum is 1 and it is required. Multi-select "add an extra" groups keep
--    their own rule (they may be genuinely optional), so only max_select = 1 is
--    touched.
update public.modifier_groups
   set is_required = true,
       min_select  = greatest(min_select, 1)
 where max_select = 1
   and (not is_required or min_select < 1);

-- 2. One rule, enforced by the database, so no future import or manual edit can
--    recreate the "pick one, or skip it" group:
--      * `is_required` tracks whether a minimum is asked for, and
--      * a radio (max_select = 1) always has a minimum of at least one.
alter table public.modifier_groups
  drop constraint if exists modifier_groups_required_matches_min;

alter table public.modifier_groups
  add constraint modifier_groups_required_matches_min
  check (
    (is_required = (min_select > 0))
    and (max_select > 1 or min_select >= 1)
  );

commit;
