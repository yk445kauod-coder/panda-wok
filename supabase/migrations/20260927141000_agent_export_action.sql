-- Give the ops agent an `export` proposal kind.
--
-- The agent can now propose "produce a data export", which on approval calls the
-- existing `create_export()` RPC — the same path the Admin exports screen uses,
-- so there is one implementation and one set of audit records. The action stays
-- behind the approval gate like every other kind: the agent proposes, a human
-- approves, and only then is a file produced.

alter table public.ops_agent_actions
  drop constraint if exists ops_agent_actions_kind_check;

alter table public.ops_agent_actions
  add constraint ops_agent_actions_kind_check check (kind in (
    'newsletter', 'reengage', 'restock', 'publish_insights',
    'price_review', 'menu_gap', 'loyalty_tuning', 'export', 'custom'
  ));
