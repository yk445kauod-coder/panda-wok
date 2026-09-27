import "server-only";
import { tryCreateAdminSupabase } from "@/lib/supabase/server";
import {
  getPublicMenu,
  getPublicSettings,
  getRestaurant,
  getEnabledRewards,
} from "@/lib/services/catalog";
import { listStockItems, listOffers } from "@/lib/services/admin-catalog";
import { getDashboardMetrics } from "@/lib/crm/insights";

/**
 * The ops agent's tools: named, typed reads over the live database.
 *
 * Each tool is a thin, read-only wrapper around an existing service — the same
 * code the admin pages use — so the agent and the console never disagree about
 * what the data is. Tools return compact JSON and are deliberately capped; an
 * agent that can pull 10,000 orders into its context is an agent that burns the
 * budget without insight.
 *
 * There is intentionally no write tool. Mutation happens only through the
 * approval queue (`ops_agent_actions`) and its explicit apply handlers.
 */

export type AgentToolName =
  | "menu_summary"
  | "menu_item_lookup"
  | "offers_list"
  | "stock_status"
  | "orders_metrics"
  | "business_settings";

export type AgentToolResult = { tool: AgentToolName; data: unknown };

const TOOL_DESCRIPTIONS: Record<AgentToolName, string> = {
  menu_summary: "Counts and names of live categories and dishes, with price range.",
  menu_item_lookup: "Look up one dish by slug or name — price, availability, flags.",
  offers_list: "Current enabled offers with their thresholds and values.",
  stock_status: "Stock items that are low or out, worst first.",
  orders_metrics: "30-day order/revenue/customer metrics from the dashboard service.",
  business_settings: "Brand, contact (incl. InstaPay) and ordering configuration.",
};

/** One-line-per-tool description for a prompt. Cheap to include, never verbose. */
export function renderToolCatalogue(): string {
  return (Object.keys(TOOL_DESCRIPTIONS) as AgentToolName[])
    .map((name) => `- ${name}: ${TOOL_DESCRIPTIONS[name]}`)
    .join("\n");
}

export async function callAgentTool(
  name: AgentToolName,
  args: Record<string, unknown> = {},
): Promise<AgentToolResult> {
  switch (name) {
    case "menu_summary": {
      const menu = await getPublicMenu();
      const prices = menu.items.map((i) => Number(i.price)).filter((n) => Number.isFinite(n));
      return {
        tool: name,
        data: {
          categories: menu.categories.map((c) => ({ slug: c.slug, name: c.name_en })),
          dishCount: menu.items.length,
          availableCount: menu.items.filter((i) => i.is_available).length,
          priceRange:
            prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
        },
      };
    }

    case "menu_item_lookup": {
      const query = String(args.query ?? "").trim().toLowerCase();
      if (!query) return { tool: name, data: { error: "query required" } };
      const menu = await getPublicMenu();
      const matches = menu.items
        .filter((i) => i.slug.toLowerCase() === query || i.name_en.toLowerCase().includes(query))
        .slice(0, 5)
        .map((i) => ({
          slug: i.slug,
          name: i.name_en,
          price: Number(i.price),
          available: i.is_available,
          spicy: i.is_spicy,
          vegetarian: i.is_vegetarian,
          vegan: i.is_vegan,
          containsNuts: i.contains_nuts,
        }));
      return { tool: name, data: { matches } };
    }

    case "offers_list": {
      const offers = await listOffers();
      return {
        tool: name,
        data: offers
          .filter((o) => o.is_enabled)
          .map((o) => ({
            name: o.name_en,
            kind: o.kind,
            threshold: Number(o.threshold),
            value: Number(o.value),
            maxDiscount: o.max_discount === null ? null : Number(o.max_discount),
          })),
      };
    }

    case "stock_status": {
      const stock = await listStockItems();
      const problem = stock
        .filter((s) => s.status === "low" || s.status === "out")
        .sort((a, b) => (a.status === "out" ? -1 : 1) - (b.status === "out" ? -1 : 1))
        .slice(0, 20)
        .map((s) => ({ name: s.name_en, status: s.status, quantity: s.quantity, unit: s.unit }));
      return { tool: name, data: { lowOrOut: problem, totalItems: stock.length } };
    }

    case "orders_metrics": {
      const metrics = await getDashboardMetrics(30);
      return { tool: name, data: metrics };
    }

    case "business_settings": {
      const [settings, restaurant, rewards] = await Promise.all([
        getPublicSettings(),
        getRestaurant(),
        getEnabledRewards(),
      ]);
      return {
        tool: name,
        data: {
          brand: settings.brand,
          ordering: settings.ordering,
          loyalty: settings.loyalty,
          contact: {
            phone: settings.support.phone,
            phoneSecondary: settings.support.phoneSecondary,
            email: settings.support.email,
            instapayUrl: settings.support.instapayUrl,
            social: settings.support.social,
          },
          restaurant: restaurant
            ? { name: restaurant.name_en, city: restaurant.city, cuisineTags: restaurant.cuisine_tags }
            : null,
          rewardCount: rewards.length,
        },
      };
    }

    default:
      return { tool: name, data: { error: `unknown tool ${name}` } };
  }
}

/**
 * Records an observation as agent memory when it is worth recalling later. Used
 * after a run so the next report can say "stock was already low last week".
 */
export async function snapshotRunDigest(runId: string): Promise<string | null> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("ops_agent_runs")
    .select("headline, summary, actions_proposed")
    .eq("id", runId)
    .maybeSingle();
  if (!data) return null;
  return `${data.headline ?? "Run"} — ${data.summary ?? ""} (${data.actions_proposed} proposals)`;
}
