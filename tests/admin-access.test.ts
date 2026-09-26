import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV,
  ROLE_LABELS,
  can,
  canAny,
  capabilitiesFor,
  firstAccessibleHref,
  type StaffRole,
} from "@/lib/auth/rbac";
import { GUIDE_SECTIONS, GUIDE_TOPICS, topicMatches } from "@/lib/admin/guide";

const ROLES = Object.keys(ROLE_LABELS) as StaffRole[];

/**
 * Regression guard for a real lockout: the admin layout used to require
 * `orders.view` before rendering the console, but marketing holds no
 * `orders.view` and kitchen holds no `crm.view`, so no capability is shared by
 * every role. Requiring one shut legitimate members out of /admin entirely.
 */
describe("admin console access", () => {
  it("has no capability that every role shares", () => {
    const shared = capabilitiesFor(ROLES[0]).filter((capability) =>
      ROLES.every((role) => can(role, capability)),
    );
    expect(shared).toEqual([]);
  });

  it("sends every role to a destination it can actually open", () => {
    for (const role of ROLES) {
      const href = firstAccessibleHref(role);
      expect(href).not.toBe("/admin/denied");
      const entry = ADMIN_NAV.find((item) => item.href === href);
      expect(entry, `${role} resolved to an unknown href ${href}`).toBeDefined();
      expect(can(role, entry!.capability!)).toBe(true);
    }
  });

  it("gives marketing a home even though it cannot see orders", () => {
    expect(can("marketing", "orders.view")).toBe(false);
    // Marketing holds menu.manage, so it lands on the menu rather than a denial.
    expect(firstAccessibleHref("marketing")).toBe("/admin/menu");
  });

  it("gives kitchen the overview even though it cannot see customers", () => {
    expect(can("kitchen", "crm.view")).toBe(false);
    expect(firstAccessibleHref("kitchen")).toBe("/admin");
  });

  it("treats a role with no capabilities as denied rather than looping", () => {
    expect(firstAccessibleHref(null)).toBe("/admin/denied");
  });

  it("keeps the guide reachable without any capability", () => {
    const guide = ADMIN_NAV.find((item) => item.href === "/admin/guide");
    expect(guide).toBeDefined();
    expect(guide!.capability).toBeUndefined();
    for (const role of ROLES) {
      // Every role may see the guide, which is how a member learns its limits.
      expect(!guide!.capability || can(role, guide!.capability)).toBe(true);
    }
  });

  it("canAny is the any-of counterpart to can", () => {
    expect(canAny("marketing", ["orders.view", "crm.view"])).toBe(true);
    expect(canAny("marketing", ["orders.view", "kitchen.view"])).toBe(false);
    expect(canAny(null, ["crm.view"])).toBe(false);
  });

  it("only owners can assign roles and restore backups", () => {
    for (const role of ROLES) {
      const expected = role === "owner";
      expect(can(role, "roles.manage")).toBe(expected);
      expect(can(role, "backups.restore")).toBe(expected);
    }
  });

  it("never lets a non-owner escalate by creating an owner", () => {
    // The action refuses owner creation unless the actor is an owner; this pins
    // the capability that refusal is built on.
    for (const role of ROLES.filter((r) => r !== "owner")) {
      expect(can(role, "roles.manage")).toBe(false);
    }
  });
});

describe("ops guide content", () => {
  it("has unique topic ids", () => {
    const ids = GUIDE_TOPICS.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every topic a title, summary, icon and at least two steps", () => {
    for (const topic of GUIDE_TOPICS) {
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.summary.length).toBeGreaterThan(0);
      expect(topic.icon.length).toBeGreaterThan(0);
      expect(topic.steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("only references capabilities that exist in the matrix", () => {
    const known = new Set(ROLES.flatMap((role) => capabilitiesFor(role)));
    for (const topic of GUIDE_TOPICS) {
      if (topic.capability) {
        expect(known, `${topic.id} references ${topic.capability}`).toContain(
          topic.capability,
        );
      }
    }
  });

  it("covers the flow the order status machine actually implements", () => {
    const flow = GUIDE_TOPICS.find((topic) => topic.id === "order-flow");
    expect(flow).toBeDefined();
    const text = flow!.steps.map((step) => step.body).join(" ").toLowerCase();
    // The real flow is new → accepted → in_progress → prepared →
    // out_for_delivery → finished, and pickup skips the rider step.
    expect(text).toContain("pickup skips");
    // The terminal-status rules are the tips, not the steps.
    const tips = (flow!.tips ?? []).join(" ").toLowerCase();
    expect(tips).toContain("cannot be reopened");
    expect(tips).toContain("refunded");
  });

  it("states the two-layer access model the code enforces", () => {
    const security = GUIDE_TOPICS.find((topic) => topic.id === "security");
    expect(security).toBeDefined();
    const text = security!.steps.map((step) => step.body).join(" ");
    expect(text).toContain("passcode");
    expect(text.toLowerCase()).toContain("signature");
  });

  it("searches across titles, summaries and step text", () => {
    const loyalty = GUIDE_TOPICS.find((topic) => topic.id === "loyalty")!;
    expect(topicMatches(loyalty, "loyalty")).toBe(true);
    expect(topicMatches(loyalty, "points")).toBe(true);
    expect(topicMatches(loyalty, "REFUNDED")).toBe(true);
    expect(topicMatches(loyalty, "zzzznomatch")).toBe(false);
    // An empty query matches everything, so the guide never renders blank.
    expect(topicMatches(loyalty, "   ")).toBe(true);
  });

  it("groups every topic under exactly one section", () => {
    const counted = GUIDE_SECTIONS.reduce(
      (sum, section) => sum + section.topics.length,
      0,
    );
    expect(counted).toBe(GUIDE_TOPICS.length);
  });
});
