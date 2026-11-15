-- The Postgres triggers, recreated in SQLite.
--
-- These are transcribed from the live database (`pg_get_triggerdef` and
-- `pg_get_functiondef`), not guessed. That matters: the app relies on the
-- database to maintain `order_status_history`, the status timestamps and the
-- conversation counters, and none of that code exists in TypeScript. Getting one
-- column wrong means a customer's order timeline silently stops updating.
--
-- SQLite differences that shaped this file:
--   * A trigger cannot assign to NEW (no BEFORE trigger can rewrite the row), so
--     what Postgres did as `new.accepted_at = now()` is an UPDATE on the same row
--     from an AFTER trigger. The nested UPDATE is safe: the trigger that fires on
--     it guards on `updated_at` being unchanged, and the guard is false on the
--     second hop, so it stops.
--   * `auth.uid()` and `current_staff_role()` become `NEW.updated_by` — the shim
--     stamps the acting user on the row before writing.
--   * `to_char(now(), 'YYMM')` and a sequence become a count-based generator.

PRAGMA foreign_keys = ON;

-- An earlier revision of this file shipped a `award_points_on_finish` trigger
-- that invented a `profiles.loyalty_points` column the schema does not have, plus
-- two trigger names that were later merged (`touch_orders`). They are dropped
-- here so a database that ran the first version is cleaned up; without this the
-- stale trigger keeps firing and every profile read fails.
DROP TRIGGER IF EXISTS "award_points_on_finish";
DROP TRIGGER IF EXISTS "touch_orders_merged";

-- Every status change lands on the customer's timeline. `from_status` is NULL on
-- the first row, which is how the UI knows an order was placed.
DROP TRIGGER IF EXISTS "log_order_status";
CREATE TRIGGER "log_order_status"
AFTER UPDATE OF "status" ON "orders"
FOR EACH ROW
WHEN NEW."status" IS NOT OLD."status"
BEGIN
  INSERT INTO "order_status_history" ("order_id", "from_status", "to_status", "changed_by", "changed_by_role")
  VALUES (NEW."id", OLD."status", NEW."status", NEW."updated_by",
          (SELECT s."role" FROM "staff" s WHERE s."user_id" = NEW."updated_by" AND s."is_active" LIMIT 1));

  UPDATE "orders" SET
    "accepted_at" = CASE WHEN NEW."status" = 'accepted' THEN COALESCE("accepted_at", strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE "accepted_at" END,
    "prepared_at" = CASE WHEN NEW."status" = 'prepared' THEN COALESCE("prepared_at", strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE "prepared_at" END,
    "dispatched_at" = CASE WHEN NEW."status" = 'out_for_delivery' THEN COALESCE("dispatched_at", strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE "dispatched_at" END,
    "finished_at" = CASE WHEN NEW."status" = 'finished' THEN COALESCE("finished_at", strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE "finished_at" END,
    "canceled_at" = CASE WHEN NEW."status" IN ('canceled','rejected','failed','refunded') THEN COALESCE("canceled_at", strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE "canceled_at" END,
    "payment_status" = CASE WHEN NEW."status" = 'refunded' THEN 'refunded' ELSE "payment_status" END
  WHERE "id" = NEW."id";
END;

-- The opening timeline row, written when the order is created.
DROP TRIGGER IF EXISTS "log_order_status_insert";
CREATE TRIGGER "log_order_status_insert"
AFTER INSERT ON "orders"
FOR EACH ROW
BEGIN
  INSERT INTO "order_status_history" ("order_id", "from_status", "to_status", "changed_by", "changed_by_role", "note")
  VALUES (NEW."id", NULL, NEW."status", NEW."user_id", NULL, 'Order placed');
END;

-- `updated_at` on every touch. Postgres did this in one BEFORE trigger per table;
-- the guard keeps the nested UPDATE from firing the trigger again.
DROP TRIGGER IF EXISTS "touch_orders";
CREATE TRIGGER "touch_orders"
AFTER UPDATE ON "orders" FOR EACH ROW
WHEN NEW."updated_at" IS OLD."updated_at"
BEGIN
  UPDATE "orders" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE "id" = NEW."id";
END;

DROP TRIGGER IF EXISTS "touch_categories";
CREATE TRIGGER "touch_categories"
AFTER UPDATE ON "categories" FOR EACH ROW
WHEN NEW."updated_at" IS OLD."updated_at"
BEGIN
  UPDATE "categories" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE "id" = NEW."id";
END;

DROP TRIGGER IF EXISTS "touch_menu_items";
CREATE TRIGGER "touch_menu_items"
AFTER UPDATE ON "menu_items" FOR EACH ROW
WHEN NEW."updated_at" IS OLD."updated_at"
BEGIN
  UPDATE "menu_items" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE "id" = NEW."id";
END;

DROP TRIGGER IF EXISTS "touch_addresses";
CREATE TRIGGER "touch_addresses"
AFTER UPDATE ON "addresses" FOR EACH ROW
WHEN NEW."updated_at" IS OLD."updated_at"
BEGIN
  UPDATE "addresses" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE "id" = NEW."id";
END;

DROP TRIGGER IF EXISTS "touch_offers";
CREATE TRIGGER "touch_offers"
AFTER UPDATE ON "offers" FOR EACH ROW
WHEN NEW."updated_at" IS OLD."updated_at"
BEGIN
  UPDATE "offers" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE "id" = NEW."id";
END;

DROP TRIGGER IF EXISTS "touch_faqs";
CREATE TRIGGER "touch_faqs"
AFTER UPDATE ON "faqs" FOR EACH ROW
WHEN NEW."updated_at" IS OLD."updated_at"
BEGIN
  UPDATE "faqs" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE "id" = NEW."id";
END;

DROP TRIGGER IF EXISTS "touch_announcements";
CREATE TRIGGER "touch_announcements"
AFTER UPDATE ON "announcements" FOR EACH ROW
WHEN NEW."updated_at" IS OLD."updated_at"
BEGIN
  UPDATE "announcements" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE "id" = NEW."id";
END;

DROP TRIGGER IF EXISTS "touch_delivery_zones";
CREATE TRIGGER "touch_delivery_zones"
AFTER UPDATE ON "delivery_zones" FOR EACH ROW
WHEN NEW."updated_at" IS OLD."updated_at"
BEGIN
  UPDATE "delivery_zones" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE "id" = NEW."id";
END;

-- A new message bumps its conversation: the unread counter, the ordering key and
-- the reopen rule (a customer replying to a closed thread opens it again).
DROP TRIGGER IF EXISTS "messages_bump";
CREATE TRIGGER "messages_bump"
AFTER INSERT ON "messages"
FOR EACH ROW
BEGIN
  UPDATE "conversations" SET
    "last_message_at" = NEW."created_at",
    "status" = CASE WHEN "status" = 'closed' AND NEW."sender_kind" = 'customer' THEN 'open' ELSE "status" END,
    "staff_unread" = CASE WHEN NEW."sender_kind" = 'customer' THEN COALESCE("staff_unread", 0) + 1 ELSE "staff_unread" END,
    "customer_unread" = CASE WHEN NEW."sender_kind" = 'staff' THEN COALESCE("customer_unread", 0) + 1 ELSE "customer_unread" END
  WHERE "id" = NEW."conversation_id";
END;

-- A team message bumps its thread, for the "most recent first" list.
DROP TRIGGER IF EXISTS "team_messages_touch";
CREATE TRIGGER "team_messages_touch"
AFTER INSERT ON "team_messages"
FOR EACH ROW
BEGIN
  UPDATE "team_threads" SET "last_message_at" = NEW."created_at" WHERE "id" = NEW."thread_id";
END;

-- A new active staff member joins every channel.
DROP TRIGGER IF EXISTS "staff_join_channels";
CREATE TRIGGER "staff_join_channels"
AFTER INSERT ON "staff"
FOR EACH ROW
WHEN NEW."is_active" = 1 AND NEW."user_id" IS NOT NULL
BEGIN
  INSERT INTO "team_thread_members" ("thread_id", "user_id")
  SELECT t."id", NEW."user_id" FROM "team_threads" t WHERE t."kind" = 'channel'
  ON CONFLICT DO NOTHING;
END;

-- The activity trail. Postgres wrote this inside `place_order_internal`; keeping
-- it as a trigger means the log exists no matter which path creates the order.
DROP TRIGGER IF EXISTS "log_order_created";
CREATE TRIGGER "log_order_created"
AFTER INSERT ON "orders"
FOR EACH ROW
BEGIN
  INSERT INTO "activity_logs" ("user_id", "event", "entity", "entity_id", "metadata")
  VALUES (NEW."user_id", 'ORDER_CREATED', 'orders', NEW."id", '{}');
END;
