import { z } from "zod";
import { canonicalPhone } from "@/lib/utils/phone";

/** Shared primitives. Every server action validates against these first. */

export const uuidSchema = z.string().uuid();

/**
 * Phone numbers are normalised to canonical E.164 (+20… for Egypt) before they
 * leave validation. Without this, `01277593815` and `+201277593815` would be
 * treated as different identities, so the unique index could not stop one
 * person creating two accounts — or, worse, a second account could be rejected
 * by the trigger with an opaque database error.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(6, "Phone number is too short")
  .max(24, "Phone number is too long")
  .regex(/^[+0-9()\-\s]+$/, "Phone number contains invalid characters")
  .transform((value, ctx) => {
    const canonical = canonicalPhone(value);
    if (!canonical) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number" });
      return z.NEVER;
    }
    return canonical;
  });

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");

export const moneySchema = z.coerce
  .number()
  .min(0, "Price cannot be negative")
  .max(1_000_000);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

/**
 * A staff `login_id` is a credential typed at /admin, matched case-insensitively
 * through `ilike`. The character set is deliberately narrow: it excludes LIKE
 * pattern characters (`%` `_` `*`) and filter syntax, so a worker cannot type a
 * wildcard to match another staff row, and the owner cannot accidentally create
 * an id that only ever matches itself.
 */
export const loginIdPattern = /^[A-Za-z0-9._@+\- \u0600-\u06FF]+$/;

export const LOGIN_ID_HINT = "Use letters, numbers or . _ @ + - only";

export const loginIdSchema = z
  .string()
  .trim()
  .min(4, "Use at least 4 characters")
  .max(60, "Keep the login id under 60 characters")
  .regex(loginIdPattern, LOGIN_ID_HINT);

export const optionalUuid = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

/**
 * Sign-in accepts either identifier the product supports: a real email, or a
 * phone number. Most accounts are created with a phone only (see signUpSchema),
 * so validating this as an email rejected the majority of customers before the
 * phone-to-placeholder mapping in signInAction could ever run. The field is
 * deliberately permissive here — the authoritative check is Supabase's, and
 * being stricter only locks people out with a confusing message.
 */
export const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email or phone number")
    .max(160, "That value is too long")
    .refine(
      (value) =>
        /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ||
        /^[+]?[\d\s()-]{8,}$/.test(value),
      "Enter a valid email address or phone number",
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your name").max(80),
  phone: phoneSchema,
  email: z
    .union([z.string().trim().email("Enter a valid email address"), z.literal("")])
    .optional()
    .transform((v) => {
      const value = typeof v === "string" ? v.trim() : "";
      return value ? value : undefined;
    }),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(72, "Password is too long"),
  locale: z.enum(["en", "ar"]).default("en"),
  marketingOptIn: z.coerce.boolean().default(false),
  next: z.string().optional(),
});

export const addressSchema = z.object({
  id: optionalUuid,
  label: z.string().trim().min(1, "Give this address a label").max(40),
  contactName: z.string().trim().min(2, "Who should the rider ask for?").max(80),
  contactPhone: phoneSchema,
  addressLine: z.string().trim().min(4, "Enter the street and building number").max(200),
  building: optionalText(40),
  floor: optionalText(20),
  apartment: optionalText(20),
  landmark: optionalText(120),
  area: optionalText(80),
  city: z.string().trim().min(2).max(80).default("Alexandria"),
  notes: optionalText(300),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  accuracyM: z.coerce.number().min(0).max(100000).nullable().optional(),
  isDefault: z.coerce.boolean().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const cartLineSchema = z.object({
  menuItemId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(100),
  // Ten is a generous hard ceiling; the per-group max_select is enforced
  // authoritatively inside place_order, which can see the group definition.
  modifiers: z.array(uuidSchema).max(10).default([]),
  notes: z.string().trim().max(200).optional(),
});

export const placeOrderSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
  items: z.array(cartLineSchema).min(1, "Your basket is empty").max(60),
  addressId: optionalUuid,
  fulfillment: z.enum(["delivery", "pickup"]).default("delivery"),
  paymentMethod: z
    .enum(["cash_on_delivery", "card_on_delivery", "online"])
    .default("cash_on_delivery"),
  customerNote: z.string().trim().max(300).optional(),
  pointsToRedeem: z.coerce.number().int().min(0).max(100000).default(0),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your name").max(80),
  phone: phoneSchema,
  locale: z.enum(["en", "ar"]).default("en"),
  marketingOptIn: z.coerce.boolean().default(false),
  notificationsOptIn: z.coerce.boolean().default(true),
});

export const feedbackSchema = z.object({
  orderId: optionalUuid,
  rating: z.coerce.number().int().min(1, "Please pick a rating").max(5),
  category: z
    .enum(["food_quality", "delivery", "service", "overall", "other"])
    .default("overall"),
  title: optionalText(120),
  message: z.string().trim().min(5, "Tell us a little more").max(2000),
  imageUrls: z.array(z.string().url()).max(4).default([]),
});

export const messageSchema = z.object({
  conversationId: uuidSchema.optional(),
  body: z.string().trim().min(1, "Write a message").max(2000),
  isInternalNote: z.coerce.boolean().default(false),
});

export const orderStatusUpdateSchema = z.object({
  orderId: uuidSchema,
  status: z.enum([
    "new",
    "accepted",
    "in_progress",
    "prepared",
    "out_for_delivery",
    "finished",
    "canceled",
    "rejected",
    "failed",
    "refunded",
  ]),
  note: z.string().trim().max(300).optional(),
});

export const menuItemSchema = z.object({
  id: optionalUuid,
  categoryId: uuidSchema,
  nameEn: z.string().trim().min(2, "English name is required").max(120),
  nameAr: optionalText(120),
  nameJa: optionalText(120),
  slug: slugSchema,
  descriptionEn: optionalText(1000),
  descriptionAr: optionalText(1000),
  price: moneySchema,
  compareAtPrice: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  isAvailable: z.coerce.boolean().default(true),
  isFeatured: z.coerce.boolean().default(false),
  isSpicy: z.coerce.boolean().default(false),
  isVegetarian: z.coerce.boolean().default(false),
  isVegan: z.coerce.boolean().default(false),
  containsNuts: z.coerce.boolean().default(false),
  prepMinutes: z.coerce.number().int().min(0).max(240).default(15),
  calories: z.coerce.number().int().min(0).max(10000).nullable().optional(),
  allergens: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  ingredients: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  imageUrl: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  imageAlt: optionalText(200),
  hasTransparentPng: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  seoTitle: optionalText(200),
  seoDescription: optionalText(320),
  seoKeywords: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});

export const categorySchema = z.object({
  id: optionalUuid,
  nameEn: z.string().trim().min(2, "English name is required").max(80),
  nameAr: optionalText(80),
  nameJa: optionalText(80),
  slug: slugSchema,
  descriptionEn: optionalText(600),
  descriptionAr: optionalText(600),
  imageUrl: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  seoTitle: optionalText(200),
  seoDescription: optionalText(320),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isEnabled: z.coerce.boolean().default(true),
});

export const stockItemSchema = z.object({
  id: optionalUuid,
  nameEn: z.string().trim().min(2, "Name is required").max(80),
  nameAr: optionalText(80),
  unit: z.string().trim().min(1).max(20).default("kg"),
  quantity: z.coerce.number().min(0).max(1_000_000),
  minThreshold: z.coerce.number().min(0).max(1_000_000),
  costPerUnit: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  supplier: optionalText(120),
  autoLinkAvailability: z.coerce.boolean().default(true),
  notes: optionalText(300),
});

export const stockMovementSchema = z.object({
  stockItemId: uuidSchema,
  direction: z.enum(["in", "out", "adjust"]),
  quantity: z.coerce.number().min(0).max(1_000_000),
  reason: z.string().trim().max(200).optional(),
});

export const rewardSchema = z.object({
  id: optionalUuid,
  nameEn: z.string().trim().min(2, "Name is required").max(80),
  nameAr: optionalText(80),
  descriptionEn: optionalText(400),
  descriptionAr: optionalText(400),
  pointsCost: z.coerce.number().int().min(1, "Cost must be at least 1 point").max(1_000_000),
  kind: z.enum(["discount_amount", "discount_percent", "free_item"]),
  value: z.coerce.number().min(0).max(1_000_000).default(0),
  menuItemId: optionalUuid,
  minOrderTotal: z.coerce.number().min(0).max(1_000_000).default(0),
  tierRequired: z.enum(["bronze", "silver", "gold", "platinum"]).default("bronze"),
  isEnabled: z.coerce.boolean().default(true),
  stockLimit: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
});

export const settingsUpdateSchema = z.object({
  values: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(120),
        value: z.unknown(),
      }),
    )
    .min(1)
    .max(200),
});

export const featureFlagUpdateSchema = z.object({
  key: z.string().trim().min(1).max(60),
  isEnabled: z.coerce.boolean(),
});

export const broadcastSchema = z.object({
  title: z.string().trim().min(2, "Give the broadcast a title").max(120),
  body: z.string().trim().min(5, "Write the message").max(2000),
  channel: z.enum(["in_app", "email", "sms", "push"]).default("in_app"),
  segment: z.enum([
    "all",
    "opted_in",
    "new",
    "loyal",
    "inactive",
    "never_ordered",
    "high_value",
    "loyalty_members",
    "winback",
  ]),
  segmentValue: z.coerce.number().int().min(0).max(1_000_000).default(30),
  confirm: z.coerce.boolean().default(false),
});

export const upsellRuleSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Name is required").max(120),
  triggerKind: z.enum(["item", "category"]),
  triggerId: uuidSchema,
  suggestKind: z.enum(["item", "category"]),
  suggestId: uuidSchema,
  headlineEn: optionalText(200),
  headlineAr: optionalText(200),
  priority: z.coerce.number().int().min(0).max(999).default(0),
  isEnabled: z.coerce.boolean().default(true),
});

export const exportRequestSchema = z.object({
  dataset: z.enum([
    "users",
    "orders",
    "order_items",
    "feedback",
    "loyalty",
    "menu",
    "stock",
    "activity",
    "analytics",
    "ai_usage",
    "segments",
  ]),
  format: z.enum(["csv", "json"]).default("csv"),
});

export const backupRequestSchema = z.object({
  kind: z.enum(["database", "configuration", "menu", "media_refs", "snapshot"]),
  label: z.string().trim().max(120).optional(),
  confirm: z.coerce.boolean().default(false),
});

export const restoreRequestSchema = z.object({
  backupId: uuidSchema,
  // A restore is destructive, so the operator must type the exact keyword.
  confirmPhrase: z.literal("RESTORE PANDA WOK"),
});

export const aiProviderSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Name is required").max(60),
  kind: z.enum(["builtin", "openrouter", "cloudflare", "pollinations", "gemini", "anthropic", "openai_compatible"]).default("openai_compatible"),
  baseUrl: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  model: optionalText(120),
  secretRef: optionalText(120),
  isEnabled: z.coerce.boolean().default(false),
  isFallback: z.coerce.boolean().default(false),
  priority: z.coerce.number().int().min(0).max(9999).default(100),
  monthlyTokenQuota: z.coerce.number().int().min(0).nullable().optional(),
  maxRequestsPerMinute: z.coerce.number().int().min(1).max(10000).default(20),
});

export const aiPromptSchema = z.object({
  key: z.string().trim().min(2).max(60),
  systemInstruction: z.string().trim().min(20, "Give the model clear instructions").max(8000),
  temperature: z.coerce.number().min(0).max(2).default(0.2),
  maxTokens: z.coerce.number().int().min(64).max(8000).default(700),
  isActive: z.coerce.boolean().default(true),
});

export const assistantSchema = z.object({
  question: z.string().trim().min(2, "Ask a question").max(600),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(10)
    .default([]),
});

export const conversationCreateSchema = z.object({
  subject: z.string().trim().min(2, "What is this about?").max(120),
  message: z.string().trim().min(2, "Write your message").max(2000),
  orderId: optionalUuid,
});

export const staffSchema = z.object({
  userId: uuidSchema,
  role: z.enum(["owner", "admin", "manager", "kitchen", "support", "marketing"]),
  displayName: optionalText(80),
  loginId: z
    .union([loginIdSchema, z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  isActive: z.coerce.boolean().default(true),
});

/**
 * Owner-created account. The owner issues a team member an account with a role
 * and a `loginId` — whatever identifier the worker will type at /admin (a phone
 * number, a short code, an employee number). The worker uses that same value to
 * open the ops console, so they never need a customer login.
 */
export const createStaffSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the team member's name").max(80),
  role: z.enum(["owner", "admin", "manager", "kitchen", "support", "marketing"]),
  loginId: loginIdSchema,
  phone: z
    .union([phoneSchema, z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  email: z
    .union([z.string().trim().email("Enter a valid email address"), z.literal("")])
    .optional()
    .transform((v) => {
      const value = typeof v === "string" ? v.trim() : "";
      return value ? value : undefined;
    }),
  displayName: optionalText(80),
  isActive: z.coerce.boolean().default(true),
});

export const feedbackResponseSchema = z.object({
  feedbackId: uuidSchema,
  response: z.string().trim().min(2, "Write a reply").max(2000),
  status: z
    .enum(["new", "reviewed", "responded", "resolved", "archived"])
    .default("resolved"),
});

export const conversationStatusSchema = z.object({
  conversationId: uuidSchema,
  status: z.enum(["open", "pending", "closed"]),
  assignedTo: optionalUuid,
});

/* ----------------------------------------------------------------- content */

const localeSchema = z.enum(["en", "ar"]).default("en");
const pageKeySchema = z.string().trim().min(2).max(40);
const sectionKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores");

export const pageContentSchema = z.object({
  id: optionalUuid,
  pageKey: pageKeySchema,
  sectionKey: sectionKeySchema,
  locale: localeSchema,
  heading: optionalText(160),
  body: optionalText(6000),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isPublished: z.coerce.boolean().default(true),
});

export const faqSchema = z.object({
  id: optionalUuid,
  locale: localeSchema,
  question: z.string().trim().min(4, "Write the question").max(300),
  answer: z.string().trim().min(4, "Write the answer").max(4000),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isPublished: z.coerce.boolean().default(true),
});

export const deliveryZoneSchema = z.object({
  id: optionalUuid,
  nameEn: z.string().trim().min(2, "Name the zone").max(80),
  nameAr: optionalText(80),
  areas: z
    .string()
    .trim()
    .max(600)
    .optional()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((area) => area.trim())
        .filter(Boolean),
    ),
  fee: moneySchema,
  freeOver: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  etaMinutes: z.coerce.number().int().min(1).max(600).nullable().optional(),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const announcementSchema = z.object({
  id: optionalUuid,
  locale: localeSchema,
  message: z.string().trim().min(4, "Write the announcement").max(300),
  href: optionalText(500),
  tone: z.enum(["info", "success", "warning", "indigo"]).default("info"),
  startsAt: optionalText(40),
  endsAt: optionalText(40),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const pageSeoSchema = z.object({
  id: optionalUuid,
  pageKey: pageKeySchema,
  locale: localeSchema,
  title: optionalText(120),
  description: optionalText(320),
  ogImageUrl: optionalText(500),
  noindex: z.coerce.boolean().default(false),
});


