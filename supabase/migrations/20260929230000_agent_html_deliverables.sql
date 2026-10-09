-- Owner request (2026-09-29): the agent must be able to produce reports, an
-- inventory count, a CRM summary, user/access reports, statistics with charts,
-- boards, plans, documents and slide decks.
--
-- Six new deliverable kinds are added to the `agent_artifacts.kind` allow-list.
-- This is a constraint change only: no existing row is touched, no row is
-- deleted, and the previous seven kinds keep working. `format` already allows
-- 'html' (20260929200000), which is what the chart/slide kinds use.
--
-- The old constraint is dropped by name, not by guessing its generated name, so
-- this is safe to re-run.

alter table public.agent_artifacts
  drop constraint if exists agent_artifacts_kind_check;

alter table public.agent_artifacts
  add constraint agent_artifacts_kind_check check (kind in (
    'daily_sales', 'weekly_kpi', 'menu_engineering', 'stock_reorder',
    'winback_draft', 'pricing_review', 'eod_reconciliation', 'custom',
    'sales_dashboard', 'crm_summary', 'users_report',
    'inventory_report', 'slide_deck', 'strategy_brief'
  ));
