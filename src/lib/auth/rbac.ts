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

export function capabilitiesFor(role: StaffRole): readonly Capability[] {
  return CAPABILITIES[role] ?? [];
}

export const ADMIN_NAV: readonly {
  href: string;
  label: string;
  capability: Capability;
  group: string;
}[] = [
  { href: "/admin", label: "Overview", capability: "orders.view", group: "Operations" },
  { href: "/admin/orders", label: "Orders", capability: "orders.view", group: "Operations" },
  { href: "/admin/kitchen", label: "Kitchen", capability: "kitchen.view", group: "Operations" },
  { href: "/admin/stock", label: "Stock", capability: "stock.manage", group: "Operations" },
  { href: "/admin/menu", label: "Menu CMS", capability: "menu.manage", group: "Operations" },
  { href: "/admin/categories", label: "Categories", capability: "menu.manage", group: "Operations" },
  { href: "/admin/upsell", label: "Upselling", capability: "menu.manage", group: "Operations" },
  { href: "/admin/crm", label: "Customers", capability: "crm.view", group: "CRM" },
  { href: "/admin/crm/activity", label: "Activity", capability: "crm.view", group: "CRM" },
  { href: "/admin/crm/segments", label: "Segments", capability: "crm.view", group: "CRM" },
  { href: "/admin/crm/insights", label: "AI insights", capability: "crm.view", group: "CRM" },
  { href: "/admin/loyalty", label: "Loyalty", capability: "loyalty.manage", group: "CRM" },
  { href: "/admin/feedback", label: "Feedback", capability: "feedback.manage", group: "CRM" },
  { href: "/admin/chat", label: "Messages", capability: "chat.manage", group: "CRM" },
  { href: "/admin/broadcast", label: "Broadcast", capability: "broadcast.manage", group: "Growth" },
  { href: "/admin/analytics", label: "Analytics", capability: "analytics.view", group: "Growth" },
  { href: "/admin/ai", label: "AI centre", capability: "ai.manage", group: "Platform" },
  { href: "/admin/ai/usage", label: "AI usage", capability: "ai.manage", group: "Platform" },
  { href: "/admin/users", label: "Team & users", capability: "users.manage", group: "Platform" },
  { href: "/admin/exports", label: "Exports", capability: "exports.manage", group: "Platform" },
  { href: "/admin/backups", label: "Backups", capability: "backups.view", group: "Platform" },
  { href: "/admin/settings", label: "Settings", capability: "settings.manage", group: "Platform" },
];
