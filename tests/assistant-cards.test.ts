import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The assistant's prompt key exists in three places that must agree: the code
 * that asks for it, the migration that seeds/updates the row, and the Admin AI
 * centre's own placeholder. They drifted once (`panda_assistant` vs
 * `assistant.menu`), and the failure was silent — `getPromptInstruction` fell
 * back to hardcoded text, so operator edits did nothing. This guards the seam.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

function allMigrations(): string {
  const dir = resolve(root, "supabase/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(resolve(dir, f), "utf8"))
    .join("\n");
}

describe("assistant prompt key", () => {
  it("is requested by the action under the documented key", () => {
    const action = read("src/lib/actions/assistant.ts");
    expect(action).toContain('getPromptInstruction("assistant.menu"');
  });

  it("is recorded in ai_requests under the same key", () => {
    const action = read("src/lib/actions/assistant.ts");
    expect(action).toContain('promptKey: "assistant.menu"');
  });

  it("is seeded by a migration under the same key", () => {
    expect(allMigrations()).toContain("'assistant.menu'");
  });

  it("is not left in the database under a stale key anywhere", () => {
    // The old key must be gone from the code entirely; a lingering reference
    // would quietly re-introduce the drift.
    expect(read("src/lib/actions/assistant.ts")).not.toContain("panda_assistant");
  });

  it("matches the placeholder shown in the Admin AI centre", () => {
    expect(read("src/app/admin/ai/page.tsx")).toContain("assistant.menu");
  });
});

describe("assistant cards contract", () => {
  it("returns cards from the action so the UI can render them", () => {
    const action = read("src/lib/actions/assistant.ts");
    expect(action).toContain("cards");
  });

  it("selects cards server-side rather than accepting them from the client", () => {
    const action = read("src/lib/actions/assistant.ts");
    // The action must not trust any client-supplied card payload; it only
    // forwards exclude slugs into the server-side selector.
    expect(action).not.toMatch(/parsed\.data\.cards/);
  });

  it("renders the card component inside an assistant turn", () => {
    const ui = read("src/components/panda/assistant.tsx");
    expect(ui).toContain("AssistantMenuCards");
  });
});
