/**
 * The RPCs the app calls but D1 never registered.
 *
 * Ten of them — the settings form, the four notification readers, the four
 * agent memory/skill functions and the secret lookup — answered
 * `rpc "…" is not ported yet`, which is why the settings save and the bell
 * failed on the D1 backend. Each handler is exercised against real SQLite so the
 * SQL is checked, not just the shape.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { runRpc, type RpcContext } from "@/lib/d1/rpc";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));
const RESTAURANT = "b54b2620-90c5-4295-b617-bc1389db3ee9";

let db: SqliteD1;

const admin: RpcContext = { elevated: true, userId: "staff-1", restaurantId: RESTAURANT };
const customer: RpcContext = { elevated: false, userId: "cust-1", restaurantId: RESTAURANT };

beforeEach(() => {
  db = createTestDatabase(readFileSync(schemaPath, "utf8"));
  setD1Database(db);
  setD1Context({ userId: "staff-1", restaurantId: RESTAURANT, elevated: true });
});

async function seedNotification(id: number, userId: string, audience: string, readAt: string | null): Promise<void> {
  await db
    .prepare(
      'INSERT INTO "notifications" ("id", "user_id", "audience", "category", "kind", "title", "read_at") ' +
        "VALUES (?1, ?2, ?3, 'system', 'info', 'Hello', ?4)",
    )
    .bind(id, userId, audience, readAt)
    .run();
}

describe("settings: apply_settings_batch", () => {
  it("writes every entry and returns the count", async () => {
    await db.prepare('INSERT INTO "settings" ("key", "value") VALUES (?1, ?2)').bind("ordering.accepting_orders", "true").run();
    await db.prepare('INSERT INTO "settings" ("key", "value") VALUES (?1, ?2)').bind("ordering.hours_enabled", "false").run();

    const applied = await runRpc<number>(
      "apply_settings_batch",
      {
        p_values: [
          { key: "ordering.accepting_orders", value: false },
          { key: "ordering.hours_enabled", value: true },
        ],
      },
      admin,
    );
    expect(applied.data).toBe(2);
    expect(applied.error).toBeNull();

    const row = await db
      .prepare('SELECT "value" FROM "settings" WHERE "key" = ?1')
      .bind("ordering.accepting_orders")
      .first<{ value: string }>();
    // JSON column: the boolean is stored as JSON text, which is what the readers parse.
    expect(row?.value).toBe("false");
  });

  it("rejects an unknown key instead of silently skipping it", async () => {
    const result = await runRpc("apply_settings_batch", { p_values: [{ key: "nope.nope", value: 1 }] }, admin);
    expect(result.error?.code).toBe("SETTINGS_KEY_UNKNOWN");
  });
});

describe("notifications", () => {
  it("lists only the caller's own audience, newest first", async () => {
    await seedNotification(1, "staff-1", "staff", null);
    await seedNotification(2, "staff-1", "customer", null);
    await seedNotification(3, "other", "staff", null);

    const { data, error } = await runRpc<Array<{ id: number }>>(
      "list_my_notifications",
      { p_audience: "staff", p_limit: 20, p_unread_only: false },
      admin,
    );
    expect(error).toBeNull();
    expect(data.map((r) => r.id)).toEqual([1]);
  });

  it("counts unread and clears them", async () => {
    await seedNotification(1, "staff-1", "staff", null);
    await seedNotification(2, "staff-1", "staff", "2026-01-01T00:00:00Z");

    const before = await runRpc<number>("count_unread_notifications", { p_audience: "staff" }, admin);
    expect(before.data).toBe(1);

    const cleared = await runRpc<number>("mark_all_notifications_read", { p_audience: "staff" }, admin);
    expect(cleared.data).toBe(1);

    const after = await runRpc<number>("count_unread_notifications", { p_audience: "staff" }, admin);
    expect(after.data).toBe(0);
  });

  it("marks one notification read", async () => {
    await seedNotification(7, "staff-1", "staff", null);
    const result = await runRpc("mark_notification_read", { p_id: 7 }, admin);
    expect(result.error).toBeNull();
    const row = await db.prepare('SELECT "read_at" FROM "notifications" WHERE "id" = 7').first<{ read_at: string | null }>();
    expect(row?.read_at).not.toBeNull();
  });

  it("refuses to read another user's feed for a non-elevated caller", async () => {
    const result = await runRpc("list_my_notifications", { p_audience: "staff", p_user_id: "someone-else" }, customer);
    expect(result.error?.code).toBe("FORBIDDEN");
  });
});

describe("agent memory and skills", () => {
  it("stores a memory and finds it by similarity", async () => {
    const id = await runRpc<string>(
      "add_agent_memory",
      {
        p_scope: "owner",
        p_subject_id: null,
        p_kind: "fact",
        p_content: "The kitchen closes at 01:00.",
        p_metadata: {},
        p_embedding: "[1,0,0]",
      },
      admin,
    );
    expect(typeof id.data).toBe("string");

    const hits = await runRpc<Array<{ content: string; similarity: number }>>(
      "match_agent_memory",
      { p_query_embedding: "[1,0,0]", p_scope: "owner", p_match_count: 5, p_min_similarity: 0.5 },
      admin,
    );
    expect(hits.error).toBeNull();
    expect(hits.data).toHaveLength(1);
    expect(hits.data[0].content).toContain("01:00");
    expect(hits.data[0].similarity).toBeCloseTo(1, 5);
  });

  it("keeps a customer's memory out of another customer's reach", async () => {
    await runRpc("add_agent_memory", {
      p_scope: "customer", p_subject_id: "cust-2", p_kind: "fact",
      p_content: "I am allergic to peanuts.", p_metadata: {}, p_embedding: "[0,1,0]",
    }, admin);

    const mine = await runRpc<unknown[]>(
      "match_agent_memory",
      { p_query_embedding: "[0,1,0]", p_scope: "customer", p_subject_id: "cust-1", p_min_similarity: 0.5 },
      customer,
    );
    expect(mine.data).toEqual([]);
  });

  it("replaces a skill's chunks in one transaction", async () => {
    const first = await runRpc<number>("replace_agent_skill", {
      p_name: "deploy", p_source: "repo", p_source_url: null,
      p_chunks: [{ heading: "A", content: "one", chunk_index: 0, embedding: "[1,0,0]" }],
    }, admin);
    expect(first.data).toBe(1);

    const second = await runRpc<number>("replace_agent_skill", {
      p_name: "deploy", p_source: "repo", p_source_url: null,
      p_chunks: [
        { heading: "B", content: "two", chunk_index: 0, embedding: "[1,0,0]" },
        { heading: "C", content: "three", chunk_index: 1, embedding: "[0,1,0]" },
      ],
    }, admin);
    expect(second.data).toBe(2);

    const count = await db.prepare('SELECT COUNT(*) AS c FROM "agent_skills" WHERE "name" = ?1').bind("deploy").first<{ c: number }>();
    expect(count?.c).toBe(2);

    const hits = await runRpc<Array<{ heading: string }>>(
      "match_agent_skills",
      { p_query_embedding: "[0,1,0]", p_match_count: 4, p_min_similarity: 0.5 },
      admin,
    );
    expect(hits.data.map((h) => h.heading)).toEqual(["C"]);
  });

  it("refuses a non-elevated skill write", async () => {
    const result = await runRpc("replace_agent_skill", { p_name: "x", p_chunks: [] }, customer);
    expect(result.error?.code).toBe("FORBIDDEN");
  });
});

describe("get_ai_secret", () => {
  it("answers null rather than throwing, so the env fallback keeps working", async () => {
    const result = await runRpc<string | null>("get_ai_secret", { p_name: "OPENAI_API_KEY" }, admin);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });
});
