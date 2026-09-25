"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { assertCapability } from "@/lib/auth/session";
import { logAudit } from "@/lib/activity/log";
import {
  actionError,
  actionOk,
  toFormError,
  type FormActionResult,
} from "@/lib/actions/result";
import {
  announcementSchema,
  deliveryZoneSchema,
  faqSchema,
  pageContentSchema,
  pageSeoSchema,
} from "@/lib/validation/schemas";

/**
 * Admin content mutations. These edit the customer-facing copy, FAQs, delivery
 * zones, announcements and per-page SEO. Every action asserts `settings.manage`
 * and writes an audit row; RLS is the backstop that rejects a rogue writer.
 */

function revalidateContent() {
  for (const path of ["/admin/content", "/about", "/contact", "/faq"]) {
    revalidatePath(path);
  }
  revalidatePath("/", "layout");
}

export async function savePageContentAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("settings.manage");

  const parsed = pageContentSchema.safeParse({
    id: formData.get("id") || undefined,
    pageKey: formData.get("pageKey"),
    sectionKey: formData.get("sectionKey"),
    locale: formData.get("locale") ?? "en",
    heading: formData.get("heading"),
    body: formData.get("body"),
    sortOrder: formData.get("sortOrder") || 0,
    isPublished: formData.get("isPublished") === "on",
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    page_key: parsed.data.pageKey,
    section_key: parsed.data.sectionKey,
    locale: parsed.data.locale,
    heading: parsed.data.heading ?? null,
    body: parsed.data.body ?? null,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  };

  const result = parsed.data.id
    ? await supabase
        .from("page_content")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("page_content").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Section not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "content.section_updated" : "content.section_created",
    entity: "page_content",
    entityId: result.data.id,
    after: payload,
  });

  revalidateContent();
  return actionOk({ id: result.data.id });
}

export async function deletePageContentAction(
  id: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("settings.manage");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("page_content").delete().eq("id", parsed.data);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "content.section_deleted",
    entity: "page_content",
    entityId: parsed.data,
  });

  revalidateContent();
  return actionOk();
}

export async function saveFaqAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("settings.manage");

  const parsed = faqSchema.safeParse({
    id: formData.get("id") || undefined,
    locale: formData.get("locale") ?? "en",
    question: formData.get("question"),
    answer: formData.get("answer"),
    sortOrder: formData.get("sortOrder") || 0,
    isPublished: formData.get("isPublished") === "on",
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    locale: parsed.data.locale,
    question: parsed.data.question,
    answer: parsed.data.answer,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  };

  const result = parsed.data.id
    ? await supabase
        .from("faqs")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("faqs").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("FAQ not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "content.faq_updated" : "content.faq_created",
    entity: "faqs",
    entityId: result.data.id,
    after: payload,
  });

  revalidateContent();
  return actionOk({ id: result.data.id });
}

export async function deleteFaqAction(
  id: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("settings.manage");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("faqs").delete().eq("id", parsed.data);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "content.faq_deleted",
    entity: "faqs",
    entityId: parsed.data,
  });

  revalidateContent();
  return actionOk();
}

export async function saveDeliveryZoneAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("settings.manage");

  const parsed = deliveryZoneSchema.safeParse({
    id: formData.get("id") || undefined,
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr"),
    areas: formData.get("areas") ?? "",
    fee: formData.get("fee") ?? 0,
    freeOver: formData.get("freeOver") || null,
    etaMinutes: formData.get("etaMinutes") || null,
    isActive: formData.get("isActive") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    name_en: parsed.data.nameEn,
    name_ar: parsed.data.nameAr ?? null,
    areas: parsed.data.areas,
    fee: parsed.data.fee,
    free_over: parsed.data.freeOver ?? null,
    eta_minutes: parsed.data.etaMinutes ?? null,
    is_active: parsed.data.isActive,
    sort_order: parsed.data.sortOrder,
  };

  const result = parsed.data.id
    ? await supabase
        .from("delivery_zones")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("delivery_zones").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Zone not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id ? "content.zone_updated" : "content.zone_created",
    entity: "delivery_zones",
    entityId: result.data.id,
    after: payload,
  });

  revalidateContent();
  return actionOk({ id: result.data.id });
}

export async function deleteDeliveryZoneAction(
  id: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("settings.manage");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("delivery_zones").delete().eq("id", parsed.data);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "content.zone_deleted",
    entity: "delivery_zones",
    entityId: parsed.data,
  });

  revalidateContent();
  return actionOk();
}

export async function saveAnnouncementAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("settings.manage");

  const parsed = announcementSchema.safeParse({
    id: formData.get("id") || undefined,
    locale: formData.get("locale") ?? "en",
    message: formData.get("message"),
    href: formData.get("href"),
    tone: formData.get("tone") ?? "info",
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    isActive: formData.get("isActive") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    locale: parsed.data.locale,
    message: parsed.data.message,
    href: parsed.data.href ?? null,
    tone: parsed.data.tone,
    starts_at: parsed.data.startsAt ?? null,
    ends_at: parsed.data.endsAt ?? null,
    is_active: parsed.data.isActive,
    sort_order: parsed.data.sortOrder,
  };

  const result = parsed.data.id
    ? await supabase
        .from("announcements")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("announcements").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Announcement not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: parsed.data.id
      ? "content.announcement_updated"
      : "content.announcement_created",
    entity: "announcements",
    entityId: result.data.id,
    after: payload,
  });

  revalidateContent();
  return actionOk({ id: result.data.id });
}

export async function deleteAnnouncementAction(
  id: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("settings.manage");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("announcements").delete().eq("id", parsed.data);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "content.announcement_deleted",
    entity: "announcements",
    entityId: parsed.data,
  });

  revalidateContent();
  return actionOk();
}

export async function savePageSeoAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("settings.manage");

  const parsed = pageSeoSchema.safeParse({
    id: formData.get("id") || undefined,
    pageKey: formData.get("pageKey"),
    locale: formData.get("locale") ?? "en",
    title: formData.get("title"),
    description: formData.get("description"),
    ogImageUrl: formData.get("ogImageUrl"),
    noindex: formData.get("noindex") === "on",
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const payload = {
    page_key: parsed.data.pageKey,
    locale: parsed.data.locale,
    title: parsed.data.title ?? null,
    description: parsed.data.description ?? null,
    og_image_url: parsed.data.ogImageUrl ?? null,
    noindex: parsed.data.noindex,
  };

  // page_seo is unique on (page_key, locale), so upsert rather than insert.
  const result = await supabase
    .from("page_seo")
    .upsert(payload, { onConflict: "page_key,locale" })
    .select("id")
    .single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("SEO not saved"));
  }

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "content.seo_updated",
    entity: "page_seo",
    entityId: result.data.id,
    after: payload,
  });

  revalidateContent();
  return actionOk({ id: result.data.id });
}

export async function deletePageSeoAction(
  id: string,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("settings.manage");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("page_seo").delete().eq("id", parsed.data);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "content.seo_deleted",
    entity: "page_seo",
    entityId: parsed.data,
  });

  revalidateContent();
  return actionOk();
}
