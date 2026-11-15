#!/usr/bin/env node
/**
 * Verify that every admin feature has its tables and relations in D1.
 *
 * The admin console reads from D1 (DATA_BACKEND=d1), so a feature is only
 * "working" if its tables exist *and* the joins its queries make resolve. This
 * script checks both: it lists the tables each feature owns, then runs the
 * relation probes (the same joins the pages issue) against the live database.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/verify-d1-features.mjs
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const DB = process.env.D1_DATABASE ?? "panda-wok";

/** feature -> { tables, probes: [{name, sql}] } */
const FEATURES = {
  "Menu management": {
    tables: ["menu_items", "categories", "menu_images", "modifier_groups", "modifier_options", "menu_item_ratings"],
    probes: [
      { name: "menu_items -> categories", sql: "SELECT count(*) n FROM menu_items m JOIN categories c ON c.id = m.category_id" },
      { name: "modifier_groups -> menu_items", sql: "SELECT count(*) n FROM modifier_groups g JOIN menu_items m ON m.id = g.menu_item_id" },
      { name: "modifier_options -> modifier_groups", sql: "SELECT count(*) n FROM modifier_options o JOIN modifier_groups g ON g.id = o.group_id" },
      { name: "menu_images -> menu_items", sql: "SELECT count(*) n FROM menu_images i JOIN menu_items m ON m.id = i.menu_item_id" },
      { name: "ratings -> menu_items", sql: "SELECT count(*) n FROM menu_item_ratings r JOIN menu_items m ON m.id = r.menu_item_id" },
    ],
  },
  Dashboard: {
    tables: ["orders", "order_items", "analytics_events", "menu_items", "profiles", "feedback"],
    probes: [
      { name: "orders today", sql: "SELECT count(*) n FROM orders WHERE date(created_at) = date('now')" },
      { name: "revenue source (order_items)", sql: "SELECT count(*) n FROM order_items i JOIN orders o ON o.id = i.order_id" },
      { name: "menu counts", sql: "SELECT count(*) n FROM menu_items" },
      { name: "customer counts", sql: "SELECT count(*) n FROM profiles" },
    ],
  },
  Guide: {
    // Static reference page: no tables, but it must not depend on any that are absent.
    tables: [],
    probes: [],
  },
  Categories: {
    tables: ["categories", "menu_items"],
    probes: [{ name: "categories with items", sql: "SELECT count(*) n FROM categories c WHERE EXISTS (SELECT 1 FROM menu_items m WHERE m.category_id = c.id)" }],
  },
  Offers: {
    tables: ["offers", "restaurants"],
    probes: [
      { name: "offers -> restaurants", sql: "SELECT count(*) n FROM offers o JOIN restaurants r ON r.id = o.restaurant_id" },
      { name: "offers enabled", sql: "SELECT count(*) n FROM offers WHERE is_enabled = 1" },
    ],
  },
  Orders: {
    tables: ["orders", "order_items", "order_status_history", "addresses", "delivery_zones"],
    probes: [
      { name: "orders -> order_items", sql: "SELECT count(*) n FROM orders o JOIN order_items i ON i.order_id = o.id" },
      { name: "orders -> status_history", sql: "SELECT count(*) n FROM orders o JOIN order_status_history h ON h.order_id = o.id" },
      { name: "order_items -> menu_items", sql: "SELECT count(*) n FROM order_items i JOIN menu_items m ON m.id = i.menu_item_id" },
      { name: "orders -> profiles", sql: "SELECT count(*) n FROM orders o JOIN profiles p ON p.id = o.user_id" },
    ],
  },
  Kitchen: {
    tables: ["orders", "order_items", "order_status_history"],
    probes: [{ name: "open tickets", sql: "SELECT count(*) n FROM orders WHERE status IN ('pending','confirmed','preparing','ready')" }],
  },
  CRM: {
    tables: ["profiles", "customer_tags", "customer_tag_links", "customer_notes", "addresses"],
    probes: [
      { name: "profiles -> customer_tag_links", sql: "SELECT count(*) n FROM profiles p JOIN customer_tag_links l ON l.customer_id = p.id" },
      { name: "tag_links -> customer_tags", sql: "SELECT count(*) n FROM customer_tag_links l JOIN customer_tags t ON t.id = l.tag_id" },
      { name: "notes -> profiles", sql: "SELECT count(*) n FROM customer_notes n JOIN profiles p ON p.id = n.customer_id" },
      { name: "addresses -> profiles", sql: "SELECT count(*) n FROM addresses a JOIN profiles p ON p.id = a.user_id" },
    ],
  },
  Activity: {
    tables: ["activity_logs", "analytics_events", "audit_logs"],
    probes: [
      { name: "activity_logs -> profiles", sql: "SELECT count(*) n FROM activity_logs a LEFT JOIN profiles p ON p.id = a.user_id" },
      { name: "analytics_events", sql: "SELECT count(*) n FROM analytics_events" },
    ],
  },
  Segments: {
    tables: ["customer_tags", "customer_tag_links", "profiles"],
    probes: [{ name: "tag membership", sql: "SELECT count(*) n FROM customer_tags t JOIN customer_tag_links l ON l.tag_id = t.id JOIN profiles p ON p.id = l.customer_id" }],
  },
  Feedback: {
    tables: ["feedback", "profiles", "orders"],
    probes: [
      { name: "feedback -> profiles", sql: "SELECT count(*) n FROM feedback f LEFT JOIN profiles p ON p.id = f.user_id" },
      { name: "feedback -> orders", sql: "SELECT count(*) n FROM feedback f LEFT JOIN orders o ON o.id = f.order_id" },
    ],
  },
  Analytics: {
    tables: ["analytics_events", "ai_usage_daily", "ai_requests"],
    probes: [
      { name: "analytics_events -> profiles", sql: "SELECT count(*) n FROM analytics_events e LEFT JOIN profiles p ON p.id = e.user_id" },
      { name: "ai_requests", sql: "SELECT count(*) n FROM ai_requests" },
    ],
  },
  "Team and users": {
    tables: ["profiles", "staff", "auth_users", "auth_identities", "team_threads", "team_thread_members", "team_messages"],
    probes: [
      { name: "staff -> profiles", sql: "SELECT count(*) n FROM staff s JOIN profiles p ON p.id = s.user_id" },
      { name: "profiles -> auth_users", sql: "SELECT count(*) n FROM profiles p JOIN auth_users u ON u.id = p.id" },
      { name: "auth_identities -> auth_users", sql: "SELECT count(*) n FROM auth_identities i JOIN auth_users u ON u.id = i.user_id" },
      { name: "thread_members -> threads", sql: "SELECT count(*) n FROM team_thread_members m JOIN team_threads t ON t.id = m.thread_id" },
      { name: "team_messages -> threads", sql: "SELECT count(*) n FROM team_messages m JOIN team_threads t ON t.id = m.thread_id" },
    ],
  },
  Exports: {
    tables: ["exports", "backup_records"],
    probes: [
      { name: "exports list", sql: "SELECT count(*) n FROM exports" },
      { name: "exports keep payload in D1", sql: "SELECT count(*) n FROM exports WHERE content IS NOT NULL OR storage_path IS NOT NULL" },
      { name: "backup_records list", sql: "SELECT count(*) n FROM backup_records" },
    ],
  },
  Backups: {
    tables: ["backup_records", "exports"],
    probes: [{ name: "backup_records by kind", sql: "SELECT count(*) n FROM backup_records WHERE kind IS NOT NULL" }],
  },
  Content: {
    tables: ["page_content", "page_seo", "announcements", "faqs"],
    probes: [
      { name: "page_content -> restaurants", sql: "SELECT count(*) n FROM page_content c JOIN restaurants r ON r.id = c.restaurant_id" },
      { name: "page_seo -> restaurants", sql: "SELECT count(*) n FROM page_seo s JOIN restaurants r ON r.id = s.restaurant_id" },
      { name: "announcements -> restaurants", sql: "SELECT count(*) n FROM announcements a JOIN restaurants r ON r.id = a.restaurant_id" },
      { name: "faqs -> restaurants", sql: "SELECT count(*) n FROM faqs f JOIN restaurants r ON r.id = f.restaurant_id" },
    ],
  },
  Settings: {
    tables: ["settings", "feature_flags", "delivery_zones", "ai_providers", "ai_prompts"],
    probes: [
      { name: "settings keys", sql: "SELECT count(*) n FROM settings" },
      { name: "feature_flags", sql: "SELECT count(*) n FROM feature_flags" },
      { name: "delivery_zones -> restaurants", sql: "SELECT count(*) n FROM delivery_zones z JOIN restaurants r ON r.id = z.restaurant_id" },
      { name: "ai_providers", sql: "SELECT count(*) n FROM ai_providers" },
    ],
  },
  Notifications: {
    tables: ["notifications", "profiles"],
    probes: [{ name: "notifications -> profiles", sql: "SELECT count(*) n FROM notifications n JOIN profiles p ON p.id = n.user_id" }],
  },
  "Ops agent": {
    tables: ["ops_agent_runs", "ops_agent_actions", "ops_agent_settings", "agent_skills", "agent_threads", "agent_messages", "agent_memory", "agent_artifacts", "agent_artifact_comments"],
    probes: [
      { name: "runs -> actions", sql: "SELECT count(*) n FROM ops_agent_actions a JOIN ops_agent_runs r ON r.id = a.run_id" },
      { name: "agent_messages -> threads", sql: "SELECT count(*) n FROM agent_messages m JOIN agent_threads t ON t.id = m.thread_id" },
      { name: "agent_artifacts -> runs", sql: "SELECT count(*) n FROM agent_artifacts a JOIN ops_agent_runs r ON r.id = a.run_id" },
      { name: "artifact_comments -> artifacts", sql: "SELECT count(*) n FROM agent_artifact_comments c JOIN agent_artifacts a ON a.id = c.artifact_id" },
    ],
  },
};

async function d1(sql) {
  const { stdout } = await run("npx", [
    "wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql,
  ], { maxBuffer: 32 * 1024 * 1024 });
  const parsed = JSON.parse(stdout.slice(stdout.indexOf("[")));
  return parsed[0]?.results ?? [];
}

async function main() {
  const existing = new Set((await d1("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name));
  let missingTables = 0;
  let failedProbes = 0;
  let totalProbes = 0;
  const report = [];

  for (const [feature, spec] of Object.entries(FEATURES)) {
    const missing = spec.tables.filter((t) => !existing.has(t));
    const probeResults = [];
    for (const probe of spec.probes) {
      totalProbes++;
      try {
        const rows = await d1(probe.sql);
        probeResults.push({ ...probe, ok: true, value: rows[0]?.n ?? rows[0]?.count ?? 0 });
      } catch (error) {
        failedProbes++;
        probeResults.push({ ...probe, ok: false, error: String(error.message ?? error).slice(0, 160) });
      }
    }
    missingTables += missing.length;
    const ok = missing.length === 0 && probeResults.every((p) => p.ok);
    report.push({ feature, ok, missing, probes: probeResults });
    console.log(`\n${ok ? "PASS" : "FAIL"}  ${feature}`);
    if (missing.length) console.log(`      missing tables: ${missing.join(", ")}`);
    for (const p of probeResults) {
      console.log(`      ${p.ok ? "ok  " : "ERR "} ${p.name}${p.ok ? ` = ${p.value}` : ` :: ${p.error}`}`);
    }
  }

  const okCount = report.filter((r) => r.ok).length;
  console.log(`\n=== ${okCount}/${report.length} features fully wired; ${missingTables} missing tables, ${failedProbes}/${totalProbes} failed probes ===`);
  process.exit(okCount === report.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
