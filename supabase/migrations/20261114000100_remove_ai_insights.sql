-- Remove the AI insights feature's configuration.
--
-- The /admin/crm/insights page, its API route, the insight engine and the
-- model narrative are gone from the app, so the rows that only existed to
-- configure that surface are dead weight. The customer assistant
-- (ai.assistant.*, ai_prompts key 'assistant.menu') is untouched.
--
-- Historical ai_requests / ai_usage_daily rows keep their surface value; they
-- are a read-only ledger and deleting them would rewrite past usage history.

delete from settings where key = 'ai.crm_insights.enabled';

delete from ai_prompts where key = 'crm_insights';
