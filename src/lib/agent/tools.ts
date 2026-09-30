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
import { getCrmStats, segmentOverview, listCrmCustomers } from "@/lib/crm/customers";

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
  | "stock_inventory"
  | "orders_metrics"
  | "orders_recent"
  | "crm_summary"
  | "crm_customers"
  | "users_summary"
  | "business_settings"
  | "list_documents"
  | "recall_memory"
  | "remember_memory";

export type AgentToolResult = { tool: AgentToolName; data: unknown };

const TOOL_DESCRIPTIONS: Record<AgentToolName, string> = {
  menu_summary: "Counts and names of live categories and dishes, with price range.",
  menu_item_lookup: "Look up one dish by slug or name — price, availability, flags.",
  offers_list: "Current enabled offers with their thresholds and values.",
  stock_status: "Stock items that are low or out, worst first.",
  stock_inventory:
    "FULL stock count: every item with on-hand, threshold, unit, cost, supplier and status.",
  orders_metrics: "30-day order/revenue/customer metrics from the dashboard service.",
  orders_recent:
    "The most recent orders with number, status, total, payment and item count. Use for 'what came in lately'.",
  crm_summary:
    "Customer totals: count, lifetime value, repeat, at-risk, opted-in, plus every segment count.",
  crm_customers:
    "Top customers by lifetime value, and the newest signups. Use for 'best customers' / 'who signed up'.",
  users_summary:
    "Users and access: total users, staff members by role, and active/suspended counts.",
  business_settings: "Brand, contact (incl. InstaPay) and ordering configuration.",
  list_documents:
    "The workspace library: documents already produced (title, kind, format, size, when, reuse count) with their ids. Use before re-making a report, or to reference a document by name.",
  recall_memory:
    "Search the agent's long-term memory for anything the owner asked it to remember — preferences, policies, corrections.",
  remember_memory:
    "Save a lasting fact to the agent's long-term memory, so a later session recalls it. Use when the owner states a preference, rule or correction worth keeping.",
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

    case "stock_inventory": {
      // The full count, not just the problem rows: "جرد كامل" needs every item.
      const stock = await listStockItems();
      const items = stock.map((s) => ({
        name: s.name_en,
        unit: s.unit,
        onHand: Number(s.quantity),
        minThreshold: Number(s.min_threshold),
        costPerUnit: s.cost_per_unit === null ? null : Number(s.cost_per_unit),
        supplier: s.supplier,
        status: s.status,
      }));
      const value = items.reduce(
        (sum, s) => sum + s.onHand * (s.costPerUnit ?? 0),
        0,
      );
      return {
        tool: name,
        data: {
          totalItems: items.length,
          needsReorder: items.filter((s) => s.status === "low" || s.status === "out").length,
          totalValueEgp: value,
          items,
        },
      };
    }

    case "orders_metrics": {
      const metrics = await getDashboardMetrics(30);
      return { tool: name, data: metrics };
    }

    case "orders_recent": {
      const admin = tryCreateAdminSupabase();
      if (!admin) return { tool: name, data: { orders: [], note: "no service key" } };
      const limit = Math.min(Number(args.limit ?? 10) || 10, 25);
      const { data } = await admin
        .from("orders")
        .select(
          "order_number, status, total, payment_method, payment_status, created_at, fulfillment, order_items (quantity)",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      return {
        tool: name,
        data: (data ?? []).map((o) => ({
          number: o.order_number,
          status: o.status,
          total: Number(o.total),
          paymentMethod: o.payment_method,
          paymentStatus: o.payment_status,
          fulfillment: o.fulfillment,
          placedAt: o.created_at,
          itemCount: (o.order_items ?? []).reduce((n, i) => n + Number(i.quantity), 0),
        })),
      };
    }

    case "crm_summary": {
      const [stats, segments] = await Promise.all([getCrmStats(), segmentOverview()]);
      return { tool: name, data: { stats, segments } };
    }

    case "crm_customers": {
      // `lifetime_value` / `order_count` / `last_order_at` are computed by the
      // `crm_customers` RPC, not stored on `profiles` — reading the table
      // directly is a compile error and, worse, a silent empty result.
      const customers = await listCrmCustomers({ limit: 200 });
      const top = [...customers]
        .sort((a, b) => b.lifetime_value - a.lifetime_value)
        .slice(0, 10)
        .map((c) => ({
          name: c.full_name,
          phone: c.phone,
          lifetimeValue: c.lifetime_value,
          orderCount: c.order_count,
          lastOrderAt: c.last_order_at,
        }));
      const newest = [...customers]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 10)
        .map((c) => ({
          name: c.full_name,
          phone: c.phone,
          signedUpAt: c.created_at,
          orderCount: c.order_count,
        }));
      return { tool: name, data: { totalCustomers: customers.length, topByLifetimeValue: top, newestSignups: newest } };
    }

    case "users_summary": {
      const admin = tryCreateAdminSupabase();
      if (!admin) return { tool: name, data: { staff: [], note: "no service key" } };
      const [{ data: staff }, { count: userCount }] = await Promise.all([
        admin.from("staff").select("role, display_name, is_active, created_at"),
        admin.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      const roles = new Map<string, number>();
      for (const s of staff ?? []) roles.set(s.role, (roles.get(s.role) ?? 0) + 1);
      return {
        tool: name,
        data: {
          totalUsers: userCount ?? 0,
          staffCount: (staff ?? []).length,
          activeStaff: (staff ?? []).filter((s) => s.is_active).length,
          rolesByCount: Object.fromEntries(roles),
          staff: (staff ?? []).map((s) => ({
            name: s.display_name,
            role: s.role,
            active: s.is_active,
            addedAt: s.created_at,
          })),
        },
      };
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

    case "list_documents": {
      const { listDeliverables } = await import("@/lib/agent/deliverables");
      const rows = await listDeliverables(40);
      return {
        tool: name,
        data: {
          count: rows.length,
          documents: rows.map((d) => ({
            id: d.id,
            title: d.title,
            kind: d.kind,
            format: d.format,
            status: d.status,
            bytes: d.bytes,
            rows: d.row_count,
            reuseCount: d.reuse_count,
            createdAt: d.created_at,
          })),
        },
      };
    }

    case "recall_memory": {
      const { recall } = await import("@/lib/agent/memory");
      const query = String(args.query ?? "").trim();
      if (!query) return { tool: name, data: { error: "a query is required" } };
      const hits = await recall({ query, scope: "owner", matchCount: 6 });
      return {
        tool: name,
        data: {
          count: hits.length,
          memories: hits.map((h) => ({ kind: h.kind, content: h.content, similarity: Number(h.similarity.toFixed(3)) })),
        },
      };
    }

    case "remember_memory": {
      const { remember } = await import("@/lib/agent/memory");
      const content = String(args.content ?? "").trim();
      if (content.length < 6) return { tool: name, data: { error: "nothing worth storing" } };
      // `remember` returns null when an identical fact already exists, so a
      // repeated instruction does not fork the memory into duplicates.
      const id = await remember({ scope: "owner", kind: "owner_note", content });
      return { tool: name, data: { stored: id !== null, id } };
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
