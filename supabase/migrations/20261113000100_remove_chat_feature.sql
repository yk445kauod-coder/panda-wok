-- The customer-to-kitchen chat module was removed from the app (pages, actions,
-- services and navigation all deleted). The `chat` feature flag was the switch
-- that surfaced it, so it is dropped here too rather than left as a dead toggle
-- in the admin Settings screen.
--
-- Scope is deliberately narrow: this only removes the flag row. The `chat` AI
-- task route, the `notifications` categories and the `conversations`/`messages`
-- tables are untouched — dropping them is a separate, data-bearing decision.
delete from public.feature_flags where key = 'chat';
