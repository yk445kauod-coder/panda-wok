import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

export type LoyaltyAccount = Database["public"]["Tables"]["loyalty_accounts"]["Row"];
export type LoyaltyTransaction =
  Database["public"]["Tables"]["loyalty_transactions"]["Row"];
export type LoyaltyTier = Database["public"]["Enums"]["loyalty_tier"];

export type LoyaltyOverview = {
  account: LoyaltyAccount | null;
  transactions: LoyaltyTransaction[];
  nextTier: { tier: LoyaltyTier; threshold: number; remaining: number } | null;
  progressPercent: number;
};

const TIER_ORDER: LoyaltyTier[] = ["bronze", "silver", "gold", "platinum"];

/**
 * Tier thresholds come from settings, not from constants in code, so the
 * operator can retune the programme without a deploy.
 */
async function getTierThresholds(): Promise<Record<LoyaltyTier, number>> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [
      "loyalty.tier.silver",
      "loyalty.tier.gold",
      "loyalty.tier.platinum",
    ]);

  // These keys are not public, so a customer read returns nothing. Fall back to
  // the documented defaults rather than showing a broken ladder.
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const read = (key: string, fallback: number) => {
    const v = map.get(key);
    if (typeof v === "number") return v;
    if (typeof v === "string" && Number.isFinite(Number(v))) return Number(v);
    return fallback;
  };

  return {
    bronze: 0,
    silver: read("loyalty.tier.silver", 500),
    gold: read("loyalty.tier.gold", 2000),
    platinum: read("loyalty.tier.platinum", 5000),
  };
}

export async function getLoyaltyOverview(userId: string): Promise<LoyaltyOverview> {
  const supabase = await createServerSupabase();

  const [{ data: account }, { data: transactions }, thresholds, { data: publicThresholds }] =
    await Promise.all([
      supabase.from("loyalty_accounts").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("loyalty_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      getTierThresholds(),
      Promise.resolve({ data: null }),
    ]);

  void publicThresholds;

  const lifetime = account?.lifetime_points ?? 0;
  const currentIndex = account ? TIER_ORDER.indexOf(account.tier) : 0;
  const nextTierName = TIER_ORDER[currentIndex + 1] ?? null;
  const nextTier = nextTierName
    ? {
        tier: nextTierName,
        threshold: thresholds[nextTierName],
        remaining: Math.max(0, thresholds[nextTierName] - lifetime),
      }
    : null;

  const currentFloor = thresholds[account?.tier ?? "bronze"];
  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.max(
          0,
          ((lifetime - currentFloor) / (nextTier.threshold - currentFloor)) * 100,
        ),
      )
    : 100;

  return {
    account: account ?? null,
    transactions: transactions ?? [],
    nextTier,
    progressPercent: Math.round(progressPercent),
  };
}

export async function getMyNotifications(
  userId: string,
  limit = 30,
): Promise<Database["public"]["Tables"]["notifications"]["Row"][]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load notifications: ${error.message}`);
  return data ?? [];
}

export async function getMyFeedback(
  userId: string,
): Promise<Database["public"]["Tables"]["feedback"]["Row"][]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load your feedback: ${error.message}`);
  return data ?? [];
}
