export type StaffRole =
  | "owner"
  | "admin"
  | "manager"
  | "kitchen"
  | "support"
  | "marketing";

export type Capability =
  | "orders.view"
  | "orders.update"
  | "kitchen.view"
  | "menu.manage"
  | "stock.manage"
  | "stock.move"
  | "crm.view"
  | "crm.export"
  | "users.manage"
  | "loyalty.manage"
  | "feedback.manage"
  | "chat.manage"
  | "broadcast.manage"
  | "analytics.view"
  | "ai.manage"
  | "exports.manage"
  | "backups.view"
  | "backups.create"
  | "backups.restore"
  | "settings.manage"
  | "roles.manage";

/**
 * Capability matrix. Navigation and action buttons are driven from this table,
 * so a role never renders an action the server would reject. The database
 * enforces the same boundaries through RLS as the real backstop.
 */
const CAPABILITIES: Record<StaffRole, readonly Capability[]> = {
  owner: [
    "orders.view", "orders.update", "kitchen.view", "menu.manage",
    "stock.manage", "stock.move", "crm.view", "crm.export", "users.manage",
    "loyalty.manage", "feedback.manage", "chat.manage", "broadcast.manage",
    "analytics.view", "ai.manage", "exports.manage", "backups.view",
    "backups.create", "backups.restore", "settings.manage", "roles.manage",
  ],
  admin: [
    "orders.view", "orders.update", "kitchen.view", "menu.manage",
    "stock.manage", "stock.move", "crm.view", "crm.export", "users.manage",
    "loyalty.manage", "feedback.manage", "chat.manage", "broadcast.manage",
    "analytics.view", "ai.manage", "exports.manage", "backups.view",
    "backups.create", "settings.manage",
  ],
  manager: [
    "orders.view", "orders.update", "kitchen.view", "menu.manage",
    "stock.manage", "stock.move", "crm.view", "crm.export", "users.manage",
    "loyalty.manage", "feedback.manage", "chat.manage", "broadcast.manage",
    "analytics.view", "exports.manage", "backups.view", "backups.create",
  ],
  kitchen: [
    "orders.view", "orders.update", "kitchen.view", "stock.move", "stock.manage",
  ],
  support: [
    "orders.view", "orders.update", "kitchen.view", "crm.view",
    "feedback.manage", "chat.manage",
  ],
  marketing: [
    "crm.view", "crm.export", "broadcast.manage", "analytics.view",
    "loyalty.manage", "menu.manage",
  ],
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  kitchen: "Kitchen staff",
  support: "Customer support",
  marketing: "Marketing",
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  owner: "Full access including role assignment and backup restore.",
  admin: "Everything except role assignment and backup restore.",
  manager: "Daily operations: orders, menu, stock, CRM, exports, backups.",
  kitchen: "View and progress orders, record stock movements.",
  support: "Orders, customer records, feedback and chat. No exports.",
  marketing: "Segments, broadcasts, loyalty and analytics. Cannot modify orders.",
};

export function can(
  role: StaffRole | null | undefined,
  capability: Capability,
): boolean {
  if (!role) return false;
  return CAPABILITIES[role]?.includes(capability) ?? false;
}

/**
 * True when the role holds at least one of the given capabilities. Used where a
 * screen is reachable through more than one permission, so a role is never shut
 * out of a shared area just because it lacks one particular capability.
 */
export function canAny(
  role: StaffRole | null | undefined,
  capabilities: readonly Capability[],
): boolean {
  if (!role) return false;
  return capabilities.some((capability) => can(role, capability));
}

export function capabilitiesFor(role: StaffRole): readonly Capability[] {
  return CAPABILITIES[role] ?? [];
}

/**
 * The first destination a role may open, in navigation order. Roles do not share
 * a single capability, so this is how a member is sent somewhere useful instead
 * of being bounced in a redirect loop when they hit a page they cannot view.
 */
export function firstAccessibleHref(role: StaffRole | null | undefined): string {
  if (!role) return "/admin/denied";
  const match = ADMIN_NAV.find(
    (item) => item.capability && can(role, item.capability),
  );
  return match?.href ?? "/admin/denied";
}

export const ADMIN_NAV: readonly {
  href: string;
  /** English label, used as a fallback and for non-UI references. */
  label: string;
  /** Key under `admin.nav.` in the dictionaries, for a translated label. */
  labelKey: string;
  /** Key under `admin.group.` in the dictionaries. */
  groupKey: string;
  /** Omit to show the destination to every unlocked member. */
  capability?: Capability;
  group: string;
}[] = [
  { href: "/admin", label: "Overview", labelKey: "overview", capability: "orders.view", group: "Operations", groupKey: "operations" },
  { href: "/admin/orders", label: "Orders", labelKey: "orders", capability: "orders.view", group: "Operations", groupKey: "operations" },
  { href: "/admin/kitchen", label: "Kitchen", labelKey: "kitchen", capability: "kitchen.view", group: "Operations", groupKey: "operations" },
  { href: "/admin/stock", label: "Stock", labelKey: "stock", capability: "stock.manage", group: "Operations", groupKey: "operations" },
  { href: "/admin/menu", label: "Menu CMS", labelKey: "menu", capability: "menu.manage", group: "Operations", groupKey: "operations" },
  { href: "/admin/categories", label: "Categories", labelKey: "categories", capability: "menu.manage", group: "Operations", groupKey: "operations" },
  { href: "/admin/upsell", label: "Upselling", labelKey: "upsell", capability: "menu.manage", group: "Operations", groupKey: "operations" },
  { href: "/admin/offers", label: "Offers", labelKey: "offers", capability: "menu.manage", group: "Operations", groupKey: "operations" },
  { href: "/admin/content", label: "Content", labelKey: "content", capability: "settings.manage", group: "Operations", groupKey: "operations" },
  { href: "/admin/crm", label: "Customers", labelKey: "crm", capability: "crm.view", group: "CRM", groupKey: "crm" },
  { href: "/admin/crm/activity", label: "Activity", labelKey: "crm-activity", capability: "crm.view", group: "CRM", groupKey: "crm" },
  { href: "/admin/crm/segments", label: "Segments", labelKey: "crm-segments", capability: "crm.view", group: "CRM", groupKey: "crm" },
  { href: "/admin/crm/insights", label: "AI insights", labelKey: "crm-insights", capability: "crm.view", group: "CRM", groupKey: "crm" },
  { href: "/admin/loyalty", label: "Loyalty", labelKey: "loyalty", capability: "loyalty.manage", group: "CRM", groupKey: "crm" },
  { href: "/admin/feedback", label: "Feedback", labelKey: "feedback", capability: "feedback.manage", group: "CRM", groupKey: "crm" },
  { href: "/admin/chat", label: "Chat", labelKey: "chat", capability: "chat.manage", group: "CRM", groupKey: "crm" },
  { href: "/admin/broadcast", label: "Broadcast", labelKey: "broadcast", capability: "broadcast.manage", group: "Growth", groupKey: "growth" },
  { href: "/admin/analytics", label: "Analytics", labelKey: "analytics", capability: "analytics.view", group: "Growth", groupKey: "growth" },
  { href: "/admin/ai", label: "AI centre", labelKey: "ai", capability: "ai.manage", group: "Platform", groupKey: "platform" },
  { href: "/admin/ai/usage", label: "AI usage", labelKey: "ai-usage", capability: "ai.manage", group: "Platform", groupKey: "platform" },
  { href: "/admin/agent", label: "Ops agent", labelKey: "agent", capability: "ai.manage", group: "Platform", groupKey: "platform" },
  { href: "/admin/agent/chat", label: "Agent chat", labelKey: "agent-chat", capability: "ai.manage", group: "Platform", groupKey: "platform" },
  { href: "/admin/agent/mcp", label: "MCP servers", labelKey: "agent-mcp", capability: "ai.manage", group: "Platform", groupKey: "platform" },
  { href: "/admin/agent/automations", label: "Automations", labelKey: "agent-automations", capability: "ai.manage", group: "Platform", groupKey: "platform" },
  { href: "/admin/users", label: "Team & users", labelKey: "users", capability: "users.manage", group: "Platform", groupKey: "platform" },
  { href: "/admin/exports", label: "Exports", labelKey: "exports", capability: "exports.manage", group: "Platform", groupKey: "platform" },
  { href: "/admin/backups", label: "Backups", labelKey: "backups", capability: "backups.view", group: "Platform", groupKey: "platform" },
  { href: "/admin/settings", label: "Settings", labelKey: "settings", capability: "settings.manage", group: "Platform", groupKey: "platform" },
  // No capability: the guide is a reference every unlocked member should reach,
  // and it is how a member discovers what their own role is allowed to do.
  { href: "/admin/guide", label: "Guide", labelKey: "guide", group: "Help", groupKey: "help" },
];

/**
 * The handful of destinations a member reaches for during service, in
 * preference order. A phone shows the first four the role may open as a bottom
 * bar, plus a "More" control for the rest — so the everyday path is one tap and
 * the long tail stays available without crowding the screen.
 */
export const ADMIN_MOBILE_NAV: readonly {
  href: string;
  label: string;
  labelKey: string;
  capability: Capability;
}[] = [
  { href: "/admin", label: "Home", labelKey: "home", capability: "orders.view" },
  { href: "/admin/orders", label: "Orders", labelKey: "orders", capability: "orders.view" },
  { href: "/admin/kitchen", label: "Kitchen", labelKey: "kitchen", capability: "kitchen.view" },
  { href: "/admin/chat", label: "Chat", labelKey: "chat", capability: "chat.manage" },
  { href: "/admin/menu", label: "Menu", labelKey: "menu", capability: "menu.manage" },
  { href: "/admin/crm", label: "Customers", labelKey: "crm", capability: "crm.view" },
];
