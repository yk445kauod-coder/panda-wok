import { describe, expect, it } from "vitest";
import { createAdminSupabase } from "@/lib/supabase/server";

/**
 * Live probe for the "every choice is mandatory" fix
 * (`20261009000200_require_all_modifier_choices`).
 *
 * A group with `min_select > 0` is asking a question that must be answered — a
 * protein, a size, a piece count, a rice-or-noodles base. `place_order` only
 * enforces the answer when `is_required` is true, so any group that declares a
 * minimum but is not required lets a customer add and complete an order without
 * choosing (the eleven "Choose your protein" groups were exactly this).
 *
 * This asserts against the live DB that the invariant holds, so a future import
 * or manual edit that drops `is_required` fails loudly instead of quietly
 * letting orders through with no choice.
 *
 * Skipped unless MODIFIER_LIVE=1 so the normal suite never touches production.
 */
const live = process.env.MODIFIER_LIVE === "1";

describe.skipIf(!live)("every modifier group with a minimum is required", () => {
  it("has no group that asks a minimum but is optional", async () => {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("modifier_groups")
      .select("id, name_en, min_select, is_required")
      .gt("min_select", 0)
      .eq("is_required", false);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("marks the protein groups mandatory", async () => {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("modifier_groups")
      .select("name_en, min_select, is_required")
      .eq("name_en", "Choose your protein");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
    for (const group of data ?? []) {
      expect(group.min_select).toBeGreaterThan(0);
      expect(group.is_required).toBe(true);
    }
  });
});
