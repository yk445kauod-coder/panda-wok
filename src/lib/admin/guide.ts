import type { Capability, StaffRole } from "@/lib/auth/rbac";

/**
 * The ops guide. Content lives here rather than in the page so the same copy can
 * be rendered by the guide screen, searched, and unit-tested without a DOM.
 *
 * Everything here describes behaviour that is actually implemented: the role
 * descriptions match rbac.ts, the status flow matches ALLOWED_TRANSITIONS, and
 * the pricing rules are the live `settings` values. If the system changes, this
 * file has to change with it.
 */

export type GuideStep = {
  title: string;
  body: string;
};

export type GuideTopic = {
  id: string;
  title: string;
  /** One-line summary shown on the card and matched by search. */
  summary: string;
  /** Icon key resolved by the page, so this module stays free of React. */
  icon: string;
  /** Capability required to act on this topic; drives the "you can do this" mark. */
  capability?: Capability;
  steps: GuideStep[];
  tips?: string[];
};

export type GuideSection = {
  id: string;
  title: string;
  intro: string;
  topics: GuideTopic[];
};

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    intro:
      "How the ops console opens, and what each person is allowed to do once inside.",
    topics: [
      {
        id: "unlock",
        title: "Opening the ops console",
        summary: "One field at /admin — the passcode, or the login id the owner issued you.",
        icon: "key",
        steps: [
          {
            title: "Go to /admin",
            body: "Any browser, phone or laptop. There is no separate staff app and no customer login needed.",
          },
          {
            title: "Type your credential",
            body: "The owner types the shared passcode. A team member types the login id the owner created for them — a cashier id, a phone number, an employee number.",
          },
          {
            title: "You land on the console",
            body: "The passcode opens every module as the owner. A login id opens only the modules that member's role allows; the rest are hidden from the navigation and rejected by the server.",
          },
        ],
        tips: [
          "The console stays unlocked for 8 hours on that browser, then asks again.",
          "Rotating the passcode immediately signs everyone out — useful if a credential leaks.",
          "Nobody is blocked from /admin: a locked console shows the passcode field, never a sign-in wall.",
        ],
      },
      {
        id: "roles",
        title: "Who can do what",
        summary: "Six roles. Each person sees only the modules their role allows.",
        icon: "shield",
        capability: "users.manage",
        steps: [
          { title: "Owner", body: "Everything, including creating team accounts and restoring backups." },
          { title: "Admin", body: "Everything except assigning roles and restoring backups." },
          { title: "Manager", body: "Daily operations: orders, menu, stock, customers, exports and backups." },
          { title: "Kitchen staff", body: "See and progress orders, and record stock movements. No customer data, no money figures." },
          { title: "Customer support", body: "Orders, customer records, feedback and chat. Cannot export data." },
          { title: "Marketing", body: "Segments, broadcasts, loyalty and analytics. Cannot change orders." },
        ],
        tips: [
          "Two people never share a login id — that is what makes the audit trail meaningful.",
          "A member can only ever act inside their role, even if they guess a URL.",
        ],
      },
      {
        id: "create-staff",
        title: "Creating a team account",
        summary: "Issue a login id for a cashier or cook — no email required.",
        icon: "user-plus",
        capability: "users.manage",
        steps: [
          { title: "Open Team & users", body: "You will see the members who already have access." },
          { title: "Add a member", body: "Choose a role, then set a login id — a short word, a phone number, or an employee number. This is the value they will type at /admin." },
          { title: "Hand over the login id", body: "Tell them the login id. There is no password to remember and nothing to email." },
        ],
        tips: [
          "Deactivating a member takes effect on their next request, not when their session expires.",
          "Only an owner can create another owner.",
        ],
      },
    ],
  },
  {
    id: "orders",
    title: "Orders and the kitchen",
    intro: "The daily loop: an order arrives, the kitchen works it, the rider delivers it.",
    topics: [
      {
        id: "order-queue",
        title: "Working the order queue",
        summary: "Filter by status, open an order, and see the customer and the basket.",
        icon: "receipt",
        capability: "orders.view",
        steps: [
          { title: "Open Orders", body: "Every order for the restaurant, newest first. Tabs across the top count each status so you can see the backlog at a glance." },
          { title: "Read an order", body: "Tap a row for the basket, the delivery address, the note the customer left, and the exact pin they shared for the rider." },
          { title: "Progress it", body: "The action buttons only ever offer the next valid step, so you cannot jump an order to delivered by mistake." },
        ],
        tips: [
          "A customer can hold several live orders at once; each is priced and tracked separately.",
          "Tapping submit twice is safe — order creation is idempotent, so a double tap never duplicates an order.",
        ],
      },
      {
        id: "order-flow",
        title: "The order status flow",
        summary: "Received → accepted → preparing → packed → on the way → delivered.",
        icon: "route",
        capability: "orders.update",
        steps: [
          { title: "Order received", body: "The order exists and the kitchen has not reviewed it yet." },
          { title: "Kitchen accepted", body: "The kitchen has taken it on and committed a prep time." },
          { title: "Preparing your food", body: "The order is being cooked." },
          { title: "Prepared and packed", body: "Food is bagged and waiting for the rider." },
          { title: "On the way", body: "The rider has left. Delivery orders only — pickup skips this step." },
          { title: "Delivered", body: "The order is closed and the customer has earned loyalty points." },
        ],
        tips: [
          "Cancel, reject, fail and refund all close an order permanently — it cannot be reopened.",
          "Only an order that has already gone out for delivery can be refunded.",
        ],
      },
      {
        id: "kitchen-board",
        title: "Using the kitchen board",
        summary: "A live board grouped by what needs doing next, built for a screen on the wall.",
        icon: "chef",
        capability: "kitchen.view",
        steps: [
          { title: "Watch the columns", body: "New, cooking, ready and dispatching. Each order shows how long it has been waiting." },
          { title: "Move an order on", body: "One tap advances it to the next column; the board refreshes itself so every screen stays in step." },
        ],
        tips: [
          "The elapsed timer is there to catch an order that has been sitting too long.",
          "This board is safe to leave open all day — it only ever reads.",
        ],
      },
    ],
  },
  {
    id: "menu",
    title: "Menu, stock and offers",
    intro: "What the customer can order, what you have, and what you nudge them toward.",
    topics: [
      {
        id: "menu-cms",
        title: "Editing the menu",
        summary: "Add dishes, set prices in pounds, and hide an item without deleting it.",
        icon: "book",
        capability: "menu.manage",
        steps: [
          { title: "Pick a category", body: "Dishes are grouped into categories, and each category can be shown or hidden from the customer menu." },
          { title: "Edit a dish", body: "Name in English and Arabic, price, prep time, and whether it is available right now." },
          { title: "Hide instead of delete", body: "Marking a dish unavailable removes it from ordering immediately while keeping its history on past orders." },
        ],
        tips: [
          "Arabic names are what the Arabic site shows; leaving one blank falls back to English.",
          "Every price is in Egyptian pounds and always shows two decimals.",
        ],
      },
      {
        id: "stock",
        title: "Tracking stock",
        summary: "Record what you use and what you buy, and get warned before you run out.",
        icon: "boxes",
        capability: "stock.manage",
        steps: [
          { title: "Add an item", body: "Name it, set the unit and a minimum threshold." },
          { title: "Record a movement", body: "Every delivery in and every use out is a movement, so the count is always explainable." },
          { title: "Act on the warnings", body: "Anything at or below its threshold is flagged, and the overview counts what is low or out." },
        ],
        tips: ["Stock never edits silently — a correction is a movement, so you can see who changed what."],
      },
      {
        id: "upsell",
        title: "Setting up upsells",
        summary: "Suggest an extra at checkout — a drink with a main, for example.",
        icon: "sparkles",
        capability: "menu.manage",
        steps: [
          { title: "Choose the trigger", body: "Pick the dish or category that starts the suggestion." },
          { title: "Choose the suggestion", body: "Pick what to offer and how prominent it should be." },
          { title: "Watch the result", body: "The overview shows whether the suggestion is converting." },
        ],
      },
    ],
  },
  {
    id: "customers",
    title: "Customers and growth",
    intro: "Who is buying, what they think, and how you reach them again.",
    topics: [
      {
        id: "crm",
        title: "Finding a customer",
        summary: "Search by name or phone, see their orders and loyalty balance.",
        icon: "users",
        capability: "crm.view",
        steps: [
          { title: "Search", body: "Type a name or a phone number. Egyptian numbers match whichever form they were saved in." },
          { title: "Read the profile", body: "Order history, total spend, loyalty tier and any feedback they have left." },
          { title: "Block only when you must", body: "Blocking stops a customer ordering; it is logged and reversible." },
        ],
        tips: ["Customer data is personal — export only what you actually need."],
      },
      {
        id: "segments",
        title: "Building a segment",
        summary: "Group customers by spend, loyalty or recency, then message them.",
        icon: "gauge",
        capability: "crm.view",
        steps: [
          { title: "Choose the rule", body: "For example: ordered in the last 30 days, or spent over a set amount." },
          { title: "Check the count", body: "The member count updates as you change the rule, so you can see the audience before sending anything." },
        ],
        tips: ["A segment with no members cannot be broadcast to — the send is refused rather than silently dropped."],
      },
      {
        id: "feedback",
        title: "Handling feedback",
        summary: "Read what customers said, reply once, and mark it handled.",
        icon: "star",
        capability: "feedback.manage",
        steps: [
          { title: "Open Feedback", body: "Newest first, with the rating and the order it belongs to." },
          { title: "Reply", body: "Your reply is stored against the feedback so the next person can see what was said." },
          { title: "Close it", body: "Marking it handled takes it out of the open queue." },
        ],
      },
      {
        id: "broadcast",
        title: "Sending a broadcast",
        summary: "Message a segment in-app. It is confirmed before it sends.",
        icon: "radio",
        capability: "broadcast.manage",
        steps: [
          { title: "Write it", body: "A title and a short body. Keep it useful — it lands in the customer's notifications." },
          { title: "Pick the audience", body: "Send to a segment rather than everyone, so the message stays relevant." },
          { title: "Confirm", body: "A broadcast has to be confirmed before it sends, so a stray tap cannot message the whole customer base." },
        ],
      },
      {
        id: "loyalty",
        title: "Running loyalty",
        summary: "Points are earned per pound spent and redeemed at checkout.",
        icon: "heart",
        capability: "loyalty.manage",
        steps: [
          { title: "Set the rewards", body: "Decide what points are worth and what they can be exchanged for." },
          { title: "Adjust a balance", body: "A manual adjustment is recorded as a transaction with a reason, so the history always adds up." },
        ],
        tips: ["Points are earned when an order is delivered, and taken back if it is refunded."],
      },
    ],
  },
  {
    id: "platform",
    title: "Settings and safety",
    intro: "How the restaurant is configured, and how your data is protected.",
    topics: [
      {
        id: "settings",
        title: "Changing a setting",
        summary: "Delivery fee, tax, contact numbers, opening hours and branding.",
        icon: "settings",
        capability: "settings.manage",
        steps: [
          { title: "Find the group", body: "Settings are grouped — delivery, tax, contact, hours, brand." },
          { title: "Edit and save", body: "Changes apply to the customer site on the next page load; no deploy is needed." },
        ],
        tips: [
          "Delivery fee, free-delivery threshold and tax rate are read live by checkout, so a change affects the very next order.",
          "Contact numbers shown to customers come from here — keep them current.",
        ],
      },
      {
        id: "backups",
        title: "Backups and exports",
        summary: "Take a backup before a big change, and export data when you need it.",
        icon: "database",
        capability: "backups.view",
        steps: [
          { title: "Request a backup", body: "A backup is recorded and can be restored by an owner if something goes wrong." },
          { title: "Export a dataset", body: "Choose orders, customers or another dataset and get a file you can open in a spreadsheet." },
        ],
        tips: [
          "Restoring a backup is owner-only, on purpose — it replaces live data.",
          "Exports contain personal data. Store them somewhere safe and delete them when done.",
        ],
      },
      {
        id: "security",
        title: "How access is protected",
        summary: "Two independent layers, so a guessed URL or a leaked id is not enough.",
        icon: "lock",
        steps: [
          { title: "Layer 1 — the console credential", body: "Nothing under /admin loads without the passcode or a valid login id. The credential is never stored in the browser — only a signature derived from it." },
          { title: "Layer 2 — the role", body: "Even inside the console, each request is checked against your role, and the database itself refuses any row your role may not touch." },
          { title: "The audit trail", body: "Creating accounts, changing an order and adjusting a balance are all logged with who did it and when." },
        ],
        tips: [
          "If you think a login id leaked, deactivate that member — it takes effect immediately.",
          "If the passcode leaked, rotate it; every existing console session is signed out at once.",
        ],
      },
    ],
  },
];

/** Flattened topic list, used by search and by the topic counter. */
export const GUIDE_TOPICS: readonly (GuideTopic & { sectionTitle: string })[] =
  GUIDE_SECTIONS.flatMap((section) =>
    section.topics.map((topic) => ({ ...topic, sectionTitle: section.title })),
  );

/** Case-insensitive match over a topic's title, summary and step text. */
export function topicMatches(topic: GuideTopic, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    topic.title,
    topic.summary,
    ...topic.steps.flatMap((step) => [step.title, step.body]),
    ...(topic.tips ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export const GUIDE_ROLE_ORDER: readonly StaffRole[] = [
  "owner",
  "admin",
  "manager",
  "kitchen",
  "support",
  "marketing",
];
