"use server";

import { revalidatePath } from "next/cache";
import { revalidatePublicData } from "@/lib/cache/revalidate";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createServerSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";
import { assertCapability } from "@/lib/auth/session";
import { logAudit } from "@/lib/activity/log";
import {
  isExportDataset,
} from "@/lib/export/build";
import { createExportJob } from "@/lib/export/create";
import { backupObjectPath, buildBackup } from "@/lib/backup/build";
import {
  actionError,
  actionFail,
  actionOk,
  toFormError,
  type FormActionResult,
} from "@/lib/actions/result";
import {
  orderStatusUpdateSchema,
  menuItemSchema,
  categorySchema,
  modifierGroupSchema,
  modifierOptionSchema,
  stockItemSchema,
  stockMovementSchema,
  rewardSchema,
  settingsUpdateSchema,
  featureFlagUpdateSchema,
  broadcastSchema,
  upsellRuleSchema,
  offerSchema,
  exportRequestSchema,
  backupRequestSchema,
  aiProviderSchema,
  aiPromptSchema,
  staffSchema,
  createStaffSchema,
  feedbackResponseSchema,
  feedbackPublishSchema,
  conversationStatusSchema,
  uuidSchema,
} from "@/lib/validation/schemas";
import { placeholderEmailFor } from "@/lib/auth/phone";
import { escapeLike, randomId } from "@/lib/utils/format";
import { AI_TASKS } from "@/lib/ai/provider";
import { paymentStatusFor } from "@/lib/services/order-workflow";

/** Narrow guard shared by the single-row mutations. */
function isUuid(value: string) {
  return uuidSchema.safeParse(value).success;
}

/**
 * Admin mutations. Every entry point asserts a capability before touching the
 * database, and writes an audit row afterwards. Errors are returned as values,
 * never thrown across the wire.
 */

/* ------------------------------------------------------------------ orders */

export async function updateOrderStatusAction(
  formData: FormData,
): Promise<FormActionResult<{ status: string }>> {
  const session = await assertCapability("orders.update");

  const parsed = orderStatusUpdateSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();

  const { data: current, error: readError } = await supabase
    .from("orders")
    .select("id, status, user_id, payment_status")
    .eq("id", parsed.data.orderId)
    .maybeSingle();

  if (readError || !current) {
    return { ok: false, error: { code: "ITEM_NOT_FOUND", message: "Order not found." } };
  }

  if (current.status === parsed.data.status) {
    return actionOk({ status: current.status });
  }

  const terminal = ["canceled", "rejected", "failed", "refunded"];
  if (terminal.includes(current.status) && !terminal.includes(parsed.data.status)) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: `This order is already ${current.status} and cannot be reopened.`,
      },
    };
  }

  // Status timestamps feed the customer timeline, so stamp them as we go.
  const stamps: Record<string, Partial<Record<string, string>>> = {
    accepted: { accepted_at: new Date().toISOString() },
    prepared: { prepared_at: new Date().toISOString() },
    out_for_delivery: { dispatched_at: new Date().toISOString() },
    finished: { finished_at: new Date().toISOString() },
    canceled: { canceled_at: new Date().toISOString() },
  };

  // A refunded order is no longer paid. The money state has to follow the
  // workflow, otherwise the dashboard counts a refund as collected revenue.
  const nextPayment = paymentStatusFor(parsed.data.status, current.payment_status);
  const paymentStatus =
    nextPayment === current.payment_status ? {} : { payment_status: nextPayment };

  const { error } = await supabase
    .from("orders")
    .update({
      status: parsed.data.status,
      ...(stamps[parsed.data.status] ?? {}),
      ...paymentStatus,
      ...(parsed.data.status === "canceled"
        ? { cancel_reason: parsed.data.note ?? "Canceled by the kitchen" }
        : {}),
    })
    .eq("id", parsed.data.orderId);

  if (error) return actionError(error);

  // order_status_history is written by the log_order_status trigger; the note
  // is attached via a follow-up update so it lands on that same row.
  if (parsed.data.note) {
    await supabase
      .from("order_status_history")
      .update({ note: parsed.data.note })
      .eq("order_id", parsed.data.orderId)
      .eq("to_status", parsed.data.status);
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "order.status_changed",
    entity: "orders",
    entityId: parsed.data.orderId,
    before: { status: current.status },
    after: { status: parsed.data.status },
  });

  revalidatePath("/admin/orders");
  revalidatePath("/admin/kitchen");
  revalidatePath(`/orders/${parsed.data.orderId}`);
  return actionOk({ status: parsed.data.status });
}

/* ------------------------------------------------------------------- menu */

function menuItemPayload(v: ReturnType<typeof menuItemSchema.parse>) {
  return {
    category_id: v.categoryId,
    name_en: v.nameEn,
    name_ar: v.nameAr ?? null,
    slug: v.slug,
    description_en: v.descriptionEn ?? null,
    description_ar: v.descriptionAr ?? null,
    price: v.price,
    compare_at_price: v.compareAtPrice ?? null,
    is_available: v.isAvailable,
    is_featured: v.isFeatured,
    is_spicy: v.isSpicy,
    is_vegetarian: v.isVegetarian,
    is_vegan: v.isVegan,
    contains_nuts: v.containsNuts,
    calories: v.calories ?? null,
    allergens: v.allergens,
    ingredients: v.ingredients,
    image_url: v.imageUrl ?? null,
    image_alt: v.imageAlt ?? null,
    has_transparent_png: v.hasTransparentPng,
    sort_order: v.sortOrder,
    seo_title: v.seoTitle ?? null,
    seo_description: v.seoDescription ?? null,
    seo_keywords: v.seoKeywords,
  };
}

export async function saveMenuItemAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("menu.manage");

  const parsed = menuItemSchema.safeParse({
    id: formData.get("id") || undefined,
    categoryId: formData.get("categoryId"),
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr") ?? undefined,
    slug: formData.get("slug"),
    descriptionEn: formData.get("descriptionEn") ?? undefined,
    descriptionAr: formData.get("descriptionAr") ?? undefined,
    price: formData.get("price"),
    compareAtPrice: formData.get("compareAtPrice") || null,
    isAvailable: formData.get("isAvailable") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    isSpicy: formData.get("isSpicy") === "on",
    isVegetarian: formData.get("isVegetarian") === "on",
    isVegan: formData.get("isVegan") === "on",
    containsNuts: formData.get("containsNuts") === "on",
    calories: formData.get("calories") || null,
    allergens: parseList(formData.get("allergens")),
    ingredients: parseList(formData.get("ingredients")),
    imageUrl: formData.get("imageUrl") ?? undefined,
    imageAlt: formData.get("imageAlt") ?? undefined,
    hasTransparentPng: formData.get("hasTransparentPng") === "on",
    sortOrder: formData.get("sortOrder") || 0,
    seoTitle: formData.get("seoTitle") ?? undefined,
    seoDescription: formData.get("seoDescription") ?? undefined,
    seoKeywords: parseList(formData.get("seoKeywords")),
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = menuItemPayload(parsed.data);

  const result = parsed.data.id
    ? await supabase
        .from("menu_items")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("menu_items").insert(payload).select("id").single();

  if (result.error || !result.data) {
    const duplicate = /duplicate key|unique/i.test(result.error?.message ?? "");
    return duplicate
      ? {
          ok: false,
          error: { code: "UNKNOWN", message: "That slug is already used by another dish." },
          fields: { slug: "This slug is taken" },
        }
      : actionError(result.error ?? new Error("Dish not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "menu_item.updated" : "menu_item.created",
    entity: "menu_items",
    entityId: result.data.id,
    after: { slug: parsed.data.slug, price: parsed.data.price },
  });

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath(`/menu/${parsed.data.slug}`);
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk({ id: result.data.id });
}

export async function deleteMenuItemAction(
  menuItemId: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  const supabase = await createServerSupabase();

  // Soft delete: order history references this dish, so it is hidden rather
  // than removed. Orders keep their snapshots either way.
  const { error } = await supabase
    .from("menu_items")
    .update({ is_available: false, is_archived: true })
    .eq("id", menuItemId);

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "menu_item.archived",
    entity: "menu_items",
    entityId: menuItemId,
  });

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

export async function duplicateMenuItemAction(
  menuItemId: string,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("menu.manage");
  const supabase = await createServerSupabase();

  const { data: source, error: readError } = await supabase
    .from("menu_items")
    .select("*")
    .eq("id", menuItemId)
    .maybeSingle();

  if (readError || !source) {
    return { ok: false, error: { code: "ITEM_NOT_FOUND", message: "Dish not found." } };
  }

  const { id: _id, created_at: _created, updated_at: _updated, ...rest } = source;

  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      ...rest,
      name_en: `${source.name_en} (copy)`,
      slug: `${source.slug}-copy-${Math.random().toString(36).slice(2, 6)}`,
      is_available: false,
      is_featured: false,
    })
    .select("id")
    .single();

  if (error || !data) return actionError(error ?? new Error("Copy failed"));

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "menu_item.duplicated",
    entity: "menu_items",
    entityId: data.id,
    after: { from: menuItemId },
  });

  revalidatePath("/admin/menu");
  return actionOk({ id: data.id });
}

export async function toggleMenuItemAction(
  menuItemId: string,
  field: "is_available" | "is_featured" | "has_transparent_png",
  value: boolean,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  const supabase = await createServerSupabase();

  const patch: Record<typeof field, boolean> = { ...{ [field]: value } } as Record<
    typeof field,
    boolean
  >;

  const { error } = await supabase
    .from("menu_items")
    .update(patch)
    .eq("id", menuItemId);

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: `menu_item.${field}`,
    entity: "menu_items",
    entityId: menuItemId,
    after: { [field]: value },
  });

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

/**
 * The three states a dish can be in, as one action rather than two independent
 * booleans. The pairing matters: `is_archived` is what removes a dish from the
 * customer menu entirely, while `is_available = false` keeps it visible and
 * marked out of stock. Setting one without the other is the mistake this prevents —
 * archiving always clears availability, and going live always clears archive.
 *
 * Nothing is ever deleted: a hidden dish keeps its row, translations, photos and
 * every order snapshot that referenced it, and one call brings it back.
 */
export type MenuItemVisibility = "live" | "sold_out" | "hidden";

export async function setMenuItemVisibilityAction(
  menuItemId: string,
  visibility: MenuItemVisibility,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  if (!isUuid(menuItemId)) return actionFail("VALIDATION", "Invalid dish.");

  const patch =
    visibility === "live"
      ? { is_available: true, is_archived: false }
      : visibility === "sold_out"
        ? { is_available: false, is_archived: false }
        : { is_available: false, is_archived: true };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("menu_items")
    .update(patch)
    .eq("id", menuItemId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "menu_item.visibility",
    entity: "menu_items",
    entityId: menuItemId,
    after: { visibility, ...patch },
  });

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

/* -------------------------------------------------------------- modifiers */

/**
 * Create or update a modifier group ("Choose up to 2 extras"). Groups hang off
 * a dish; the limits here mirror what `place_order` enforces, so the customer
 * can never be shown a promise the database would reject.
 */
export async function saveModifierGroupAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("menu.manage");

  const parsed = modifierGroupSchema.safeParse({
    id: formData.get("id") || undefined,
    menuItemId: formData.get("menuItemId"),
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr") ?? undefined,
    minSelect: formData.get("minSelect") || 0,
    maxSelect: formData.get("maxSelect") || 1,
    isRequired: formData.get("isRequired") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    menu_item_id: parsed.data.menuItemId,
    name_en: parsed.data.nameEn,
    name_ar: parsed.data.nameAr ?? null,
    min_select: parsed.data.minSelect,
    max_select: parsed.data.maxSelect,
    is_required: parsed.data.isRequired,
    sort_order: parsed.data.sortOrder,
  };

  const result = parsed.data.id
    ? await supabase
        .from("modifier_groups")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("modifier_groups").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Option group not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "modifier_group.updated" : "modifier_group.created",
    entity: "modifier_groups",
    entityId: result.data.id,
    after: { name: parsed.data.nameEn, menu_item_id: parsed.data.menuItemId },
  });

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  return actionOk({ id: result.data.id });
}

export async function deleteModifierGroupAction(
  groupId: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  if (!isUuid(groupId)) return actionFail("VALIDATION", "Invalid option group.");

  const supabase = await createServerSupabase();
  // modifier_options cascade from the group, so one delete removes the pair.
  const { error } = await supabase.from("modifier_groups").delete().eq("id", groupId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "modifier_group.deleted",
    entity: "modifier_groups",
    entityId: groupId,
  });

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

export async function saveModifierOptionAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("menu.manage");

  const parsed = modifierOptionSchema.safeParse({
    id: formData.get("id") || undefined,
    groupId: formData.get("groupId"),
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr") ?? undefined,
    priceDelta: formData.get("priceDelta") || 0,
    isAvailable: formData.get("isAvailable") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    group_id: parsed.data.groupId,
    name_en: parsed.data.nameEn,
    name_ar: parsed.data.nameAr ?? null,
    price_delta: parsed.data.priceDelta,
    is_available: parsed.data.isAvailable,
    sort_order: parsed.data.sortOrder,
  };

  const result = parsed.data.id
    ? await supabase
        .from("modifier_options")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("modifier_options").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Option not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "modifier_option.updated" : "modifier_option.created",
    entity: "modifier_options",
    entityId: result.data.id,
    after: { name: parsed.data.nameEn, price_delta: parsed.data.priceDelta },
  });

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  return actionOk({ id: result.data.id });
}

/**
 * Flip one option's availability. This is the "shrimp is out of stock" lever:
 * the option row stays exactly where it is (and in every past order snapshot),
 * it just stops being selectable — and `place_order` already refuses an
 * unavailable option, so the database is the boundary rather than the UI.
 */
export async function toggleModifierOptionAction(
  optionId: string,
  value: boolean,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  if (!isUuid(optionId)) return actionFail("VALIDATION", "Invalid option.");

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("modifier_options")
    .update({ is_available: value })
    .eq("id", optionId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "modifier_option.availability",
    entity: "modifier_options",
    entityId: optionId,
    after: { is_available: value },
  });

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

export async function deleteModifierOptionAction(
  optionId: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  if (!isUuid(optionId)) return actionFail("VALIDATION", "Invalid option.");

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("modifier_options").delete().eq("id", optionId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "modifier_option.deleted",
    entity: "modifier_options",
    entityId: optionId,
  });

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

export async function saveCategoryAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("menu.manage");

  const parsed = categorySchema.safeParse({
    id: formData.get("id") || undefined,
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr") ?? undefined,
    slug: formData.get("slug"),
    descriptionEn: formData.get("descriptionEn") ?? undefined,
    descriptionAr: formData.get("descriptionAr") ?? undefined,
    imageUrl: formData.get("imageUrl") ?? undefined,
    seoTitle: formData.get("seoTitle") ?? undefined,
    seoDescription: formData.get("seoDescription") ?? undefined,
    sortOrder: formData.get("sortOrder") || 0,
    isEnabled: formData.get("isEnabled") === "on",
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    name_en: parsed.data.nameEn,
    name_ar: parsed.data.nameAr ?? null,
    slug: parsed.data.slug,
    description_en: parsed.data.descriptionEn ?? null,
    description_ar: parsed.data.descriptionAr ?? null,
    image_url: parsed.data.imageUrl ?? null,
    seo_title: parsed.data.seoTitle ?? null,
    seo_description: parsed.data.seoDescription ?? null,
    sort_order: parsed.data.sortOrder,
    is_enabled: parsed.data.isEnabled,
  };

  const result = parsed.data.id
    ? await supabase
        .from("categories")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("categories").insert(payload).select("id").single();

  if (result.error || !result.data) {
    const duplicate = /duplicate key|unique/i.test(result.error?.message ?? "");
    return duplicate
      ? {
          ok: false,
          error: { code: "UNKNOWN", message: "That slug is already in use." },
          fields: { slug: "This slug is taken" },
        }
      : actionError(result.error ?? new Error("Category not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "category.updated" : "category.created",
    entity: "categories",
    entityId: result.data.id,
  });

  revalidatePath("/admin/categories");
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  return actionOk({ id: result.data.id });
}

export async function deleteCategoryAction(
  categoryId: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  const supabase = await createServerSupabase();

  const { count } = await supabase
    .from("menu_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .eq("is_archived", false);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: `Move or archive the ${count} dish${count === 1 ? "" : "es"} in this category first.`,
      },
    };
  }

  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "category.deleted",
    entity: "categories",
    entityId: categoryId,
  });

  revalidatePath("/admin/categories");
  revalidatePath("/menu");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

export async function reorderCategoryAction(
  categoryId: string,
  sortOrder: number,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("categories")
    .update({ sort_order: sortOrder })
    .eq("id", categoryId);

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "category.reordered",
    entity: "categories",
    entityId: categoryId,
    after: { sort_order: sortOrder },
  });

  revalidatePath("/admin/categories");
  revalidatePath("/menu");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

/* ------------------------------------------------------------------ stock */

export async function saveStockItemAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("stock.manage");

  const parsed = stockItemSchema.safeParse({
    id: formData.get("id") || undefined,
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr") ?? undefined,
    unit: formData.get("unit") || "kg",
    quantity: formData.get("quantity"),
    minThreshold: formData.get("minThreshold"),
    costPerUnit: formData.get("costPerUnit") || null,
    supplier: formData.get("supplier") ?? undefined,
    autoLinkAvailability: formData.get("autoLinkAvailability") === "on",
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    name_en: parsed.data.nameEn,
    name_ar: parsed.data.nameAr ?? null,
    unit: parsed.data.unit,
    quantity: parsed.data.quantity,
    min_threshold: parsed.data.minThreshold,
    cost_per_unit: parsed.data.costPerUnit ?? null,
    supplier: parsed.data.supplier ?? null,
    auto_link_availability: parsed.data.autoLinkAvailability,
    notes: parsed.data.notes ?? null,
    last_updated_at: new Date().toISOString(),
  };

  const result = parsed.data.id
    ? await supabase
        .from("stock_items")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("stock_items").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Stock item not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "stock_item.updated" : "stock_item.created",
    entity: "stock_items",
    entityId: result.data.id,
  });

  revalidatePath("/admin/stock");
  return actionOk({ id: result.data.id });
}

export async function recordStockMovementAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("stock.move");

  const parsed = stockMovementSchema.safeParse({
    stockItemId: formData.get("stockItemId"),
    direction: formData.get("direction"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();

  // The apply_stock_movement trigger adjusts quantity and recomputes status,
  // which can in turn flip linked menu items to unavailable.
  const { error } = await supabase.from("stock_movements").insert({
    stock_item_id: parsed.data.stockItemId,
    direction: parsed.data.direction,
    quantity: parsed.data.quantity,
    reason: parsed.data.reason ?? null,
    created_by: session.actorId,
  });

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "stock.movement",
    entity: "stock_items",
    entityId: parsed.data.stockItemId,
    after: {
      direction: parsed.data.direction,
      quantity: parsed.data.quantity,
    },
  });

  revalidatePath("/admin/stock");
  revalidatePath("/menu");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

/* ------------------------------------------------------------------ loyalty */

export async function saveRewardAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("loyalty.manage");

  const parsed = rewardSchema.safeParse({
    id: formData.get("id") || undefined,
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr") ?? undefined,
    descriptionEn: formData.get("descriptionEn") ?? undefined,
    descriptionAr: formData.get("descriptionAr") ?? undefined,
    pointsCost: formData.get("pointsCost"),
    kind: formData.get("kind"),
    value: formData.get("value") || 0,
    menuItemId: formData.get("menuItemId") ?? undefined,
    minOrderTotal: formData.get("minOrderTotal") || 0,
    tierRequired: formData.get("tierRequired") || "bronze",
    isEnabled: formData.get("isEnabled") === "on",
    stockLimit: formData.get("stockLimit") || null,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    name_en: parsed.data.nameEn,
    name_ar: parsed.data.nameAr ?? null,
    description_en: parsed.data.descriptionEn ?? null,
    description_ar: parsed.data.descriptionAr ?? null,
    points_cost: parsed.data.pointsCost,
    kind: parsed.data.kind,
    value: parsed.data.value,
    menu_item_id: parsed.data.menuItemId ?? null,
    min_order_total: parsed.data.minOrderTotal,
    tier_required: parsed.data.tierRequired,
    is_enabled: parsed.data.isEnabled,
    stock_limit: parsed.data.stockLimit ?? null,
  };

  const result = parsed.data.id
    ? await supabase
        .from("loyalty_rewards")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("loyalty_rewards").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Reward not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "reward.updated" : "reward.created",
    entity: "loyalty_rewards",
    entityId: result.data.id,
  });

  revalidatePath("/admin/loyalty");
  revalidatePath("/loyalty");
  return actionOk({ id: result.data.id });
}

export async function deleteRewardAction(
  rewardId: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("loyalty.manage");

  if (!isUuid(rewardId)) {
    return actionFail("VALIDATION", "That reward id is not valid.");
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("loyalty_rewards")
    .delete()
    .eq("id", rewardId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "reward.deleted",
    entity: "loyalty_rewards",
    entityId: rewardId,
  });

  revalidatePath("/admin/loyalty");
  revalidatePath("/loyalty");
  revalidatePublicData(CACHE_TAGS.rewards);
  return actionOk();
}

export async function toggleRewardAction(
  rewardId: string,
): Promise<FormActionResult<{ enabled: boolean }>> {
  const session = await assertCapability("loyalty.manage");

  if (!isUuid(rewardId)) {
    return actionFail("VALIDATION", "That reward id is not valid.");
  }

  const supabase = await createServerSupabase();
  const { data: current, error: readError } = await supabase
    .from("loyalty_rewards")
    .select("is_enabled")
    .eq("id", rewardId)
    .maybeSingle();
  if (readError) return actionError(readError);
  if (!current) return actionFail("NOT_FOUND", "That reward no longer exists.");

  const enabled = !current.is_enabled;
  const { error } = await supabase
    .from("loyalty_rewards")
    .update({ is_enabled: enabled })
    .eq("id", rewardId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: enabled ? "reward.enabled" : "reward.disabled",
    entity: "loyalty_rewards",
    entityId: rewardId,
    after: { is_enabled: enabled },
  });

  revalidatePath("/admin/loyalty");
  revalidatePath("/loyalty");
  return actionOk({ enabled });
}

export async function adjustLoyaltyPointsAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("loyalty.manage");

  const userId = String(formData.get("userId") ?? "");
  const points = Number(formData.get("points") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();

  if (!userId || !Number.isFinite(points) || points === 0 || reason.length < 3) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Provide a customer, a non-zero points amount and a reason.",
      },
    };
  }

  const supabase = await createServerSupabase();

  const { error } = await supabase.from("loyalty_transactions").insert({
    user_id: userId,
    points,
    type: points > 0 ? "bonus" : "adjust",
    reason,
    created_by: session.actorId,
  });

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "loyalty.adjusted",
    entity: "loyalty_accounts",
    entityId: userId,
    after: { points, reason },
  });

  revalidatePath("/admin/loyalty");
  revalidatePath("/admin/crm");
  return actionOk();
}

/* --------------------------------------------------------------- feedback */

export async function respondToFeedbackAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("feedback.manage");

  const parsed = feedbackResponseSchema.safeParse({
    feedbackId: formData.get("feedbackId"),
    response: formData.get("response"),
    status: formData.get("status") || "resolved",
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("feedback")
    .update({
      admin_response: parsed.data.response,
      responded_at: new Date().toISOString(),
      responded_by: session.actorId,
      status: parsed.data.status,
    })
    .eq("id", parsed.data.feedbackId);

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "feedback.responded",
    entity: "feedback",
    entityId: parsed.data.feedbackId,
    after: { status: parsed.data.status },
  });

  revalidatePath("/admin/feedback");
  revalidatePath("/feedback");
  return actionOk();
}

/**
 * Toggles whether a rating counts toward the public per-dish average.
 *
 * Kept separate from `respondToFeedbackAction` on purpose: replying to a
 * customer and publishing their score are different decisions, and an admin
 * should be able to do one without the other.
 */
export async function setFeedbackPublishedAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("feedback.manage");

  const parsed = feedbackPublishSchema.safeParse({
    feedbackId: formData.get("feedbackId"),
    isPublic: formData.get("isPublic"),
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("feedback")
    .update({ is_public: parsed.data.isPublic })
    .eq("id", parsed.data.feedbackId);

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.isPublic ? "feedback.published" : "feedback.unpublished",
    entity: "feedback",
    entityId: parsed.data.feedbackId,
    after: { is_public: parsed.data.isPublic },
  });

  revalidatePath("/admin/feedback");
  // The average is read by the public menu, so the cached menu must drop too.
  revalidatePath("/menu");
  revalidatePath("/");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

/* -------------------------------------------------------------------- chat */

export async function setConversationStatusAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("chat.manage");

  const parsed = conversationStatusSchema.safeParse({
    conversationId: formData.get("conversationId"),
    status: formData.get("status"),
    assignedTo: formData.get("assignedTo") ?? undefined,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("conversations")
    .update({
      status: parsed.data.status,
      ...(parsed.data.assignedTo ? { assigned_to: parsed.data.assignedTo } : {}),
    })
    .eq("id", parsed.data.conversationId);

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "conversation.status",
    entity: "conversations",
    entityId: parsed.data.conversationId,
    after: { status: parsed.data.status },
  });

  revalidatePath("/admin/chat");
  revalidatePath(`/admin/chat/${parsed.data.conversationId}`);
  return actionOk();
}

/* -------------------------------------------------------------- broadcast */

export async function createBroadcastAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string; recipients: number }>> {
  const session = await assertCapability("broadcast.manage");

  const parsed = broadcastSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    channel: formData.get("channel") || "in_app",
    segment: formData.get("segment"),
    segmentValue: formData.get("segmentValue") || 30,
    confirm: formData.get("confirm") === "on",
  });
  if (!parsed.success) return toFormError(parsed.error);

  if (!parsed.data.confirm) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Tick the confirmation box to send this to real customers.",
      },
    };
  }

  const supabase = await createServerSupabase();

  // Recipients are resolved by the database so the count and the fan-out use
  // the same segment definition; nothing is estimated client-side.
  const { data, error } = await supabase.rpc("send_broadcast", {
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_channel: parsed.data.channel,
    p_segment: parsed.data.segment,
    p_segment_value: parsed.data.segmentValue,
  });

  if (error) return actionError(error);

  const row = Array.isArray(data) ? data[0] : data;

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "broadcast.sent",
    entity: "broadcasts",
    entityId: row?.broadcast_id ?? null,
    after: {
      segment: parsed.data.segment,
      channel: parsed.data.channel,
      recipients: row?.recipients ?? 0,
    },
  });

  revalidatePath("/admin/broadcast");
  return actionOk({
    id: row?.broadcast_id ?? "",
    recipients: Number(row?.recipients ?? 0),
  });
}

/* ------------------------------------------------------------------ upsell */

export async function saveUpsellRuleAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("menu.manage");

  const parsed = upsellRuleSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    triggerKind: formData.get("triggerKind"),
    triggerId: formData.get("triggerId"),
    suggestKind: formData.get("suggestKind"),
    suggestId: formData.get("suggestId"),
    headlineEn: formData.get("headlineEn") ?? undefined,
    headlineAr: formData.get("headlineAr") ?? undefined,
    priority: formData.get("priority") || 0,
    isEnabled: formData.get("isEnabled") === "on",
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    name: parsed.data.name,
    trigger_kind: parsed.data.triggerKind,
    trigger_menu_item_id: parsed.data.triggerKind === "item" ? parsed.data.triggerId : null,
    trigger_category_id:
      parsed.data.triggerKind === "category" ? parsed.data.triggerId : null,
    suggest_kind: parsed.data.suggestKind,
    suggest_menu_item_id: parsed.data.suggestKind === "item" ? parsed.data.suggestId : null,
    suggest_category_id:
      parsed.data.suggestKind === "category" ? parsed.data.suggestId : null,
    headline_en: parsed.data.headlineEn ?? null,
    headline_ar: parsed.data.headlineAr ?? null,
    priority: parsed.data.priority,
    is_enabled: parsed.data.isEnabled,
  };

  const result = parsed.data.id
    ? await supabase
        .from("upsell_rules")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("upsell_rules").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Rule not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "upsell_rule.updated" : "upsell_rule.created",
    entity: "upsell_rules",
    entityId: result.data.id,
  });

  revalidatePath("/admin/upsell");
  return actionOk({ id: result.data.id });
}

export async function deleteUpsellRuleAction(
  ruleId: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  const supabase = await createServerSupabase();

  const { error } = await supabase.from("upsell_rules").delete().eq("id", ruleId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "upsell_rule.deleted",
    entity: "upsell_rules",
    entityId: ruleId,
  });

  revalidatePath("/admin/upsell");
  revalidatePublicData(CACHE_TAGS.menu);
  return actionOk();
}

/* ------------------------------------------------------------------ offers */

export async function saveOfferAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("menu.manage");

  const parsed = offerSchema.safeParse({
    id: formData.get("id") || undefined,
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr") ?? undefined,
    kind: formData.get("kind"),
    threshold: formData.get("threshold") || 0,
    value: formData.get("value"),
    maxDiscount: formData.get("maxDiscount"),
    isEnabled: formData.get("isEnabled") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    name_en: parsed.data.nameEn,
    name_ar: parsed.data.nameAr ?? null,
    kind: parsed.data.kind,
    threshold: parsed.data.threshold,
    value: parsed.data.value,
    // A ceiling only means something for a percentage offer.
    max_discount: parsed.data.kind === "percent" ? parsed.data.maxDiscount ?? null : null,
    is_enabled: parsed.data.isEnabled,
    sort_order: parsed.data.sortOrder,
  };

  const result = parsed.data.id
    ? await supabase
        .from("offers")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("offers").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Offer not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "offer.updated" : "offer.created",
    entity: "offers",
    entityId: result.data.id,
    after: { kind: payload.kind, threshold: payload.threshold, value: payload.value },
  });

  revalidatePath("/admin/offers");
  // The offer list feeds the checkout config, so the customer pages change too.
  revalidatePath("/checkout");
  revalidatePath("/cart");
  return actionOk({ id: result.data.id });
}

export async function deleteOfferAction(
  offerId: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  const supabase = await createServerSupabase();

  const { error } = await supabase.from("offers").delete().eq("id", offerId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "offer.deleted",
    entity: "offers",
    entityId: offerId,
  });

  revalidatePath("/admin/offers");
  revalidatePath("/checkout");
  revalidatePath("/cart");
  return actionOk();
}

export async function toggleOfferAction(
  offerId: string,
  enabled: boolean,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("menu.manage");
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("offers")
    .update({ is_enabled: enabled })
    .eq("id", offerId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: enabled ? "offer.enabled" : "offer.disabled",
    entity: "offers",
    entityId: offerId,
  });

  revalidatePath("/admin/offers");
  revalidatePath("/checkout");
  revalidatePath("/cart");
  return actionOk();
}

/* --------------------------------------------------------------- settings */

export async function updateSettingsAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("settings.manage");

  const raw = formData.get("values");
  let values: unknown;
  try {
    values = JSON.parse(String(raw ?? "[]"));
  } catch {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "The settings payload was not valid JSON." },
    };
  }

  const parsed = settingsUpdateSchema.safeParse({ values });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();

  // One round trip for the whole form. The previous loop issued a PATCH per row
  // (34 today) and blew the Worker's per-request subrequest budget on the free
  // plan: the save failed part-way with a generic error while the response was
  // still a 200. The RPC applies the array in a single transaction, so a bad
  // value also can no longer leave the settings half-written.
  const { error } = await supabase.rpc("apply_settings_batch", {
    p_values: parsed.data.values as never,
    p_actor: session.actorId ?? undefined,
  });

  if (error) {
    return actionError(error);
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "settings.updated",
    entity: "settings",
    entityId: null,
    after: { keys: parsed.data.values.map((v) => v.key) },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  revalidatePublicData([CACHE_TAGS.settings, CACHE_TAGS.restaurant]);
  return actionOk();
}

export async function toggleFeatureFlagAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("settings.manage");

  const parsed = featureFlagUpdateSchema.safeParse({
    key: formData.get("key"),
    isEnabled: formData.get("isEnabled") === "true",
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("feature_flags")
    .update({ is_enabled: parsed.data.isEnabled })
    .eq("key", parsed.data.key);

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "feature_flag.updated",
    entity: "feature_flags",
    entityId: parsed.data.key,
    after: { is_enabled: parsed.data.isEnabled },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  revalidatePublicData([CACHE_TAGS.settings, CACHE_TAGS.flags, CACHE_TAGS.restaurant]);
  return actionOk();
}

/* ------------------------------------------------------------------ staff */

export async function saveStaffAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("roles.manage");

  const parsed = staffSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    displayName: formData.get("displayName") ?? undefined,
    loginId: formData.get("loginId") ?? undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return toFormError(parsed.error);

  if (session.actorId && parsed.data.userId === session.actorId && parsed.data.role !== "owner") {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "You cannot remove your own owner role. Ask another owner to do it.",
      },
    };
  }

  const supabase = await createServerSupabase();
  const admin = tryCreateAdminSupabase();

  // Duty separation: `roles.manage` (owner) is required to hand out the two
  // privileged roles, so an admin/manager cannot quietly promote themselves or
  // a colleague to owner/admin.
  if (parsed.data.role === "owner" || parsed.data.role === "admin") {
    if (session.role !== "owner") {
      return actionFail(
        "FORBIDDEN",
        "Only an owner can grant the owner or admin role.",
      );
    }
  }

  // A login id is a credential, so it must be unique case-insensitively and
  // cannot be blanked by accident once set.
  const loginId = parsed.data.loginId?.trim() || null;
  if (loginId && admin) {
    const { data: clash } = await admin
      .from("staff")
      .select("user_id")
      .ilike("login_id", escapeLike(loginId))
      .neq("user_id", parsed.data.userId)
      .limit(1)
      .maybeSingle();
    if (clash) {
      return {
        ok: false,
        error: {
          code: "VALIDATION",
          message: "That login id is already used by another team member.",
        },
        fields: { loginId: "This login id is taken" },
      };
    }
  }

  const { error } = await supabase.from("staff").upsert(
    {
      user_id: parsed.data.userId,
      role: parsed.data.role,
      display_name: parsed.data.displayName ?? null,
      login_id: loginId,
      is_active: parsed.data.isActive,
    },
    { onConflict: "user_id" },
  );

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "staff.upserted",
    entity: "staff",
    entityId: parsed.data.userId,
    after: {
      role: parsed.data.role,
      is_active: parsed.data.isActive,
      login_id_set: Boolean(loginId),
    },
  });

  revalidatePath("/admin/users");
  return actionOk();
}

/**
 * Owner-created staff account. The owner issues a team member a role and a
 * login id in one step; the account is created confirmed (like customer
 * signup) so the worker can open /admin with that id immediately — no email,
 * no password reset, no customer login. The staff row is written with the
 * service role so it is not silently dropped by the staff-write RLS policy.
 */
export async function createStaffAccountAction(
  formData: FormData,
): Promise<FormActionResult<{ userId: string }>> {
  const session = await assertCapability("roles.manage");

  const parsed = createStaffSchema.safeParse({
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    loginId: formData.get("loginId"),
    phone: formData.get("phone") ?? undefined,
    email: formData.get("email") ?? undefined,
    displayName: formData.get("displayName") ?? undefined,
    isActive: formData.get("isActive") !== "off",
  });
  if (!parsed.success) return toFormError(parsed.error);

  if (parsed.data.role === "owner" && session.role !== "owner") {
    return actionFail("FORBIDDEN", "Only an owner can create another owner.");
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return actionFail(
      "UNKNOWN",
      "Creating team accounts needs the service-role key on the server.",
    );
  }

  const loginId = parsed.data.loginId.trim();
  const email = parsed.data.email ?? placeholderEmailFor(loginId);

  // Both the login id and the email identity must be unique before we touch the
  // auth provider, so the owner gets a clear message instead of a 500.
  const { data: idClash } = await admin
    .from("staff")
    .select("user_id")
    .ilike("login_id", escapeLike(loginId))
    .limit(1)
    .maybeSingle();
  if (idClash) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: "That login id is already in use." },
      fields: { loginId: "This login id is taken" },
    };
  }

  const { data: emailClash } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (emailClash) {
    return {
      ok: false,
      error: { code: "EMAIL_ALREADY_EXISTS", message: "That email is already registered." },
      fields: { email: "This email is already registered" },
    };
  }

  // A random password is set (and never surfaced): the account is opened at
  // /admin with the login id, not with this credential.
  const password = `pw-${randomId("staff")}-${Math.random().toString(36).slice(2)}`;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      locale: "en",
    },
  });

  const userId = created.data.user?.id;
  if (created.error || !userId) {
    return actionError(created.error ?? new Error("Could not create the account."));
  }

  // Repair/ensure the profile row (the handle_new_user trigger should have made
  // one, but a race or a pre-existing row is handled here), then the staff row.
  await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      email,
    },
    { onConflict: "id" },
  );

  const { error: staffError } = await admin.from("staff").upsert(
    {
      user_id: userId,
      role: parsed.data.role,
      display_name: parsed.data.displayName ?? parsed.data.fullName,
      login_id: loginId,
      is_active: parsed.data.isActive,
    },
    { onConflict: "user_id" },
  );

  if (staffError) {
    // Do not leave a half-created account behind if the staff row failed.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return actionError(staffError);
  }

  await logAudit(admin, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "staff.created",
    entity: "staff",
    entityId: userId,
    after: { role: parsed.data.role, login_id_set: true },
  });

  revalidatePath("/admin/users");
  return actionOk({ userId });
}

export async function setUserBlockedAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("users.manage");

  const userId = String(formData.get("userId") ?? "");
  const blocked = formData.get("blocked") === "true";

  if (!userId) {
    return { ok: false, error: { code: "UNKNOWN", message: "Missing customer." } };
  }
  if (userId === session.actorId) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "You cannot block your own account." },
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ is_blocked: blocked })
    .eq("id", userId);

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: blocked ? "customer.blocked" : "customer.unblocked",
    entity: "profiles",
    entityId: userId,
  });

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${userId}`);
  return actionOk();
}

/* ---------------------------------------------------------------- exports */

export async function requestExportAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string; rows: number }>> {
  const session = await assertCapability("exports.manage");

  const parsed = exportRequestSchema.safeParse({
    dataset: formData.get("dataset"),
    format: formData.get("format") || "csv",
  });
  if (!parsed.success) return toFormError(parsed.error);
  if (!isExportDataset(parsed.data.dataset)) {
    return actionFail("VALIDATION", "That dataset cannot be exported.");
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return actionFail(
      "UNKNOWN",
      "Exports need the service-role key configured on the server.",
    );
  }

  try {
    const { id, rows } = await createExportJob({
      dataset: parsed.data.dataset,
      format: parsed.data.format,
      requestedBy: session.actorId,
    });

    await logAudit(admin, {
      actorId: session.actorId,
      actorRole: session.role,
      action: "export.created",
      entity: "exports",
      entityId: id,
      after: {
        dataset: parsed.data.dataset,
        format: parsed.data.format,
        rows,
      },
    });

    revalidatePath("/admin/exports");
    return actionOk({ id, rows });
  } catch (error) {
    return actionFail(
      "UNKNOWN",
      error instanceof Error ? error.message : "The export could not be built.",
    );
  }
}

/* ---------------------------------------------------------------- backups */

export async function requestBackupAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string; bytes: number }>> {
  const session = await assertCapability("backups.create");

  const parsed = backupRequestSchema.safeParse({
    kind: formData.get("kind"),
    label: formData.get("label") ?? undefined,
    confirm: formData.get("confirm") === "on",
  });
  if (!parsed.success) return toFormError(parsed.error);

  if (!parsed.data.confirm) {
    return actionFail("VALIDATION", "Confirm that you want to create a backup.");
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return actionFail(
      "UNKNOWN",
      "Backups need the service-role key configured on the server.",
    );
  }

  // Job row first, so a failed build leaves a visible failed record instead of
  // nothing at all.
  const { data: job, error: createError } = await admin
    .from("backup_records")
    .insert({
      kind: parsed.data.kind,
      status: "running",
      label: parsed.data.label ?? null,
      created_by: session.actorId,
    })
    .select("id")
    .single();

  if (createError || !job) {
    return actionError(createError ?? new Error("Could not queue the backup."));
  }

  try {
    const built = await buildBackup({
      kind: parsed.data.kind,
      label: parsed.data.label ?? null,
    });

    const path = backupObjectPath(job.id);
    const { error: uploadError } = await admin.storage
      .from("backups")
      .upload(path, built.body, { contentType: "application/json", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { error: finishError } = await admin
      .from("backup_records")
      .update({
        status: "ready",
        bytes: built.bytes,
        storage_path: path,
        manifest: JSON.parse(JSON.stringify(built.bundle)),
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (finishError) throw new Error(finishError.message);

    await logAudit(admin, {
      actorId: session.actorId,
      actorRole: session.role,
      action: "backup.created",
      entity: "backup_records",
      entityId: job.id,
      after: { kind: parsed.data.kind, bytes: built.bytes, tables: built.tables },
    });

    revalidatePath("/admin/backups");
    return actionOk({ id: job.id, bytes: built.bytes });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The backup could not be built.";

    await admin
      .from("backup_records")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", job.id);

    return actionFail("UNKNOWN", message);
  }
}

/* --------------------------------------------------------------- AI centre */

export async function saveAiProviderAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("ai.manage");

  const parsed = aiProviderSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    kind: formData.get("kind") || "openai_compatible",
    baseUrl: formData.get("baseUrl") ?? undefined,
    model: formData.get("model") ?? undefined,
    secretRef: formData.get("secretRef") ?? undefined,
    isEnabled: formData.get("isEnabled") === "on",
    isFallback: formData.get("isFallback") === "on",
    priority: formData.get("priority") || 100,
    monthlyTokenQuota: formData.get("monthlyTokenQuota") || null,
    maxRequestsPerMinute: formData.get("maxRequestsPerMinute") || 20,
    routes: parseRoutes(formData),
  });
  if (!parsed.success) return toFormError(parsed.error);

  // secret_ref is the name of an environment variable, never the key itself:
  // the browser must never receive a credential.
  const supabase = await createServerSupabase();
  const payload = {
    name: parsed.data.name,
    kind: parsed.data.kind,
    base_url: parsed.data.baseUrl ?? null,
    model: parsed.data.model ?? null,
    secret_ref: parsed.data.secretRef ?? null,
    is_enabled: parsed.data.isEnabled,
    is_fallback: parsed.data.isFallback,
    priority: parsed.data.priority,
    monthly_token_quota: parsed.data.monthlyTokenQuota ?? null,
    max_requests_per_minute: parsed.data.maxRequestsPerMinute,
    routes: parsed.data.routes,
  };

  const result = parsed.data.id
    ? await supabase
        .from("ai_providers")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("ai_providers").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Provider not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "ai_provider.updated" : "ai_provider.created",
    entity: "ai_providers",
    entityId: result.data.id,
    // Only the reference name is audited, never a secret value.
    after: { name: parsed.data.name, secret_ref: parsed.data.secretRef ?? null },
  });

  revalidatePath("/admin/ai");
  return actionOk({ id: result.data.id });
}

/**
 * Stores (or rotates) an AI provider credential in Supabase Vault, encrypted at
 * rest. The console sends the value once over the server action boundary; it is
 * never echoed back — the page only ever shows a masked hint. Vault is written
 * through the `service_role`, and the RPC is not executable by `anon` or
 * `authenticated`, so no browser session can read a stored key.
 */
export async function saveAiSecretAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("ai.manage");

  const name = String(formData.get("name") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)) {
    return actionFail("VALIDATION", "Use letters, digits and underscores; start with a letter.");
  }
  if (value.trim().length < 8) {
    return actionFail("VALIDATION", "The key looks too short — paste the full value.");
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return actionFail("NOT_CONFIGURED", "Privileged storage is unavailable on this deployment.");
  }

  const { error } = await admin.rpc("set_ai_secret", {
    p_name: name,
    p_value: value.trim(),
    p_description: "Managed from the Panda Wok AI centre",
  });
  if (error) return actionError(error);

  // Audit the reference only — never the credential.
  await logAudit(admin, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "ai_secret.saved",
    entity: "vault.secrets",
    entityId: name,
    after: { name },
  });

  revalidatePath("/admin/ai");
  return actionOk();
}

/** Deletes a stored credential by name. Idempotent. */
export async function deleteAiSecretAction(
  name: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("ai.manage");
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)) {
    return actionFail("VALIDATION", "Invalid secret name.");
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return actionFail("NOT_CONFIGURED", "Privileged storage is unavailable on this deployment.");
  }

  const { error } = await admin.rpc("delete_ai_secret", { p_name: name });
  if (error) return actionError(error);

  await logAudit(admin, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "ai_secret.deleted",
    entity: "vault.secrets",
    entityId: name,
  });

  revalidatePath("/admin/ai");
  return actionOk();
}

export async function saveAiPromptAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("ai.manage");

  const parsed = aiPromptSchema.safeParse({
    key: formData.get("key"),
    systemInstruction: formData.get("systemInstruction"),
    temperature: formData.get("temperature") || 0.2,
    maxTokens: formData.get("maxTokens") || 700,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();

  const { error } = await supabase.from("ai_prompts").upsert(
    {
      key: parsed.data.key,
      system_instruction: parsed.data.systemInstruction,
      temperature: parsed.data.temperature,
      max_tokens: parsed.data.maxTokens,
      is_active: parsed.data.isActive,
      name: parsed.data.key,
      updated_by: session.actorId,
    },
    { onConflict: "key" },
  );

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "ai_prompt.updated",
    entity: "ai_prompts",
    entityId: parsed.data.key,
  });

  revalidatePath("/admin/ai");
  return actionOk();
}

/* ------------------------------------------------------------------ utils */

/** Splits a comma or newline separated textarea value into a clean list. */
function parseList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 30);
}

/**
 * Reads the per-task routing fields (`route_<task>`) off the provider form.
 * A blank field means "not routed for this task", so it is dropped and the
 * provider falls back to its base priority for that task.
 */
function parseRoutes(formData: FormData): Record<string, number> {
  const routes: Record<string, number> = {};
  for (const task of AI_TASKS) {
    const raw = formData.get(`route_${task}`);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) routes[task] = Math.max(0, Math.min(9999, Math.trunc(value)));
  }
  return routes;
}

// ---------------------------------------------------------------------------
// CRM notes and tags
//
// `crm.view` is the read capability; annotating a customer is a support/admin
// job, so writes require a role that actually works the CRM (never kitchen).
// The database enforces the same line through `can_edit_crm()`.
// ---------------------------------------------------------------------------

const CRM_EDIT_ROLES = new Set(["owner", "admin", "manager", "support", "marketing"]);

async function assertCrmEditor() {
  const session = await assertCapability("crm.view");
  if (!CRM_EDIT_ROLES.has(session.role)) {
    return { session, denied: actionFail("FORBIDDEN", "You do not have access to customer records.") };
  }
  return { session, denied: null };
}

export async function saveCustomerNoteAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const { session, denied } = await assertCrmEditor();
  if (denied) return denied;

  const customerId = String(formData.get("customerId") ?? "").trim();
  const noteId = String(formData.get("noteId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const isPinned = formData.get("isPinned") === "true";

  if (!customerId) return actionFail("VALIDATION", "Missing customer.");
  if (body.length < 1 || body.length > 2000) {
    return actionFail("VALIDATION", "A note must be between 1 and 2000 characters.");
  }

  const supabase = await createServerSupabase();

  const { error } = noteId
    ? await supabase
        .from("customer_notes")
        .update({ body, is_pinned: isPinned })
        .eq("id", noteId)
    : await supabase
        .from("customer_notes")
        .insert({ customer_id: customerId, author_id: session.actorId, body, is_pinned: isPinned });

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: noteId ? "customer.note_updated" : "customer.note_added",
    entity: "customer_notes",
    entityId: noteId || customerId,
  });

  revalidatePath(`/admin/crm/${customerId}`);
  return actionOk();
}

export async function deleteCustomerNoteAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const { session, denied } = await assertCrmEditor();
  if (denied) return denied;

  const customerId = String(formData.get("customerId") ?? "").trim();
  const noteId = String(formData.get("noteId") ?? "").trim();
  if (!noteId) return actionFail("VALIDATION", "Missing note.");

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("customer_notes").delete().eq("id", noteId);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "customer.note_deleted",
    entity: "customer_notes",
    entityId: noteId,
  });

  if (customerId) revalidatePath(`/admin/crm/${customerId}`);
  return actionOk();
}

/** Assign or remove one tag. The link table is the source of truth. */
export async function toggleCustomerTagAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const { session, denied } = await assertCrmEditor();
  if (denied) return denied;

  const customerId = String(formData.get("customerId") ?? "").trim();
  const tagId = String(formData.get("tagId") ?? "").trim();
  const assign = formData.get("assign") === "true";

  if (!customerId || !tagId) return actionFail("VALIDATION", "Missing customer or tag.");

  const supabase = await createServerSupabase();

  if (assign) {
    const { error } = await supabase
      .from("customer_tag_links")
      .upsert(
        { customer_id: customerId, tag_id: tagId, assigned_by: session.actorId },
        { onConflict: "customer_id,tag_id" },
      );
    if (error) return actionError(error);
  } else {
    const { error } = await supabase
      .from("customer_tag_links")
      .delete()
      .eq("customer_id", customerId)
      .eq("tag_id", tagId);
    if (error) return actionError(error);
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: assign ? "customer.tag_added" : "customer.tag_removed",
    entity: "customer_tag_links",
    entityId: customerId,
  });

  revalidatePath(`/admin/crm/${customerId}`);
  revalidatePath("/admin/crm");
  return actionOk();
}
