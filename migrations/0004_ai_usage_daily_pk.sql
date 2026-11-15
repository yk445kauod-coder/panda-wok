-- ai_usage_daily is one row per provider per day, so its key is (day, provider).
-- The generated schema declared PRIMARY KEY (day) only, which dropped every
-- provider but the first on any given day. SQLite cannot alter a primary key in
-- place, so the table is rebuilt and its rows copied across.
CREATE TABLE IF NOT EXISTS "ai_usage_daily_new" (
  "day" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'all',
  "requests" INTEGER NOT NULL DEFAULT 0,
  "errors" INTEGER NOT NULL DEFAULT 0,
  "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost" REAL NOT NULL DEFAULT 0,
  PRIMARY KEY ("day", "provider")
);

INSERT OR IGNORE INTO "ai_usage_daily_new"
  ("day", "provider", "requests", "errors", "prompt_tokens", "completion_tokens", "estimated_cost")
SELECT "day", "provider", "requests", "errors", "prompt_tokens", "completion_tokens", "estimated_cost"
FROM "ai_usage_daily";

DROP TABLE "ai_usage_daily";

ALTER TABLE "ai_usage_daily_new" RENAME TO "ai_usage_daily";
