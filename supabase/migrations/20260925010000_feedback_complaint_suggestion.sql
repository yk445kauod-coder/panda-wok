-- Feedback categories were limited to rating-style options (overall, food
-- quality, delivery, service, other), so a customer with a complaint or an
-- idea had no honest option to pick and filed it under "Something else".
-- These two values let the feedback surface cover reviews, complaints and
-- suggestions, which is what the customer-facing tab now promises.
--
-- ADD VALUE is append-only and irreversible in place, so the values are added
-- here and never removed. They are not used in this migration, which is what
-- allows it to run inside the migration transaction.
alter type public.feedback_category add value if not exists 'complaint';
alter type public.feedback_category add value if not exists 'suggestion';
