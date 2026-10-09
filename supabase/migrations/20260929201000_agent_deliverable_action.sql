-- Give the ops agent a `deliverable` proposal kind.
--
-- The agent can now propose "produce a document" (a daily sales sheet, a
-- menu-engineering report, a stock reorder list, a win-back draft, …), which on
-- approval renders the file and stores it in the private `artifacts` bucket —
-- the same deliverables the console can generate on demand. The action stays
-- behind the approval gate like every other kind: the agent proposes, a human
-- approves, and only then is a file produced.
--
-- Deliverables are read-only snapshots, so approving one never changes an order,
-- a price or the menu; it only mints a document a human still chooses to act on.

alter table public.ops_agent_actions
  drop constraint if exists ops_agent_actions_kind_check;

alter table public.ops_agent_actions
  add constraint ops_agent_actions_kind_check check (kind in (
    'newsletter', 'reengage', 'restock', 'publish_insights',
    'price_review', 'menu_gap', 'loyalty_tuning', 'export', 'deliverable', 'custom'
  ));
