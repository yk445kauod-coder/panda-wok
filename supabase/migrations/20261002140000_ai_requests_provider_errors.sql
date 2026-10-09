-- Records which providers in the chain tripped before a fallback answered.
-- A reasoning model burning its budget on hidden reasoning (`content: null`
-- with finish_reason=length) is observability gold for the operator, while the
-- *successful* fallback stays a clean `ok` in `ai_requests.status`/`error`.
alter table public.ai_requests
  add column if not exists provider_errors text;