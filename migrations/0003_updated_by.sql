-- `orders.updated_by`, the actor behind a status change.
--
-- Postgres read the actor from `auth.uid()` inside the trigger, so the column was
-- never needed and the app never writes it. SQLite has no `auth.uid()`, so the
-- value has to arrive on the row: the shim stamps it from the request context
-- before an update, and the status trigger reads it to fill `changed_by` and
-- resolve `changed_by_role` from `staff`.
--
-- This is a deliberate divergence from the Postgres schema. It is additive and
-- nullable, so it cannot break a reader that does not know about it.

ALTER TABLE "orders" ADD COLUMN "updated_by" TEXT;
