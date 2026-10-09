-- Panda Wok :: every group that asks the customer to choose must be mandatory
--
-- A group with min_select > 0 is asking a question that must be answered — a
-- protein, a size, a piece count, a rice-or-noodles base. The server only
-- enforces that question when is_required is true:
--
--     if v_group.is_required and v_group.chosen < v_group.min_select then
--       raise exception 'VALIDATION:%' ...
--
-- Eleven "Choose your protein" groups (44 options, 11 dishes) were min_select 1
-- but is_required false, so an order could be placed with no protein chosen at
-- all — the same class of defect the box fix closed, and the owner's explicit
-- request is that a choice is always mandatory.
--
-- Owner-requested. Additive and idempotent: it only flips a flag on groups that
-- already declare a minimum; no group, option, name, price or ordering changes,
-- and a second run updates nothing.

begin;

update public.modifier_groups
   set is_required = true
 where min_select > 0
   and is_required = false;

commit;
