"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { addressSchema, profileSchema } from "@/lib/validation/schemas";
import {
  actionError,
  actionOk,
  toFormError,
  type FormActionResult,
} from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";

export async function saveAddressAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await requireUser("/account/addresses");

  const raw = {
    id: formData.get("id") || undefined,
    label: formData.get("label"),
    contactName: formData.get("contactName"),
    contactPhone: formData.get("contactPhone"),
    addressLine: formData.get("addressLine"),
    building: formData.get("building") ?? undefined,
    floor: formData.get("floor") ?? undefined,
    apartment: formData.get("apartment") ?? undefined,
    landmark: formData.get("landmark") ?? undefined,
    area: formData.get("area") ?? undefined,
    city: formData.get("city") || "Alexandria",
    notes: formData.get("notes") ?? undefined,
    latitude: formData.get("latitude") || null,
    longitude: formData.get("longitude") || null,
    accuracyM: formData.get("accuracyM") || null,
    isDefault: formData.get("isDefault") === "on",
  };

  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const v = parsed.data;

  // The unique partial index allows one default per user, so clear the old one
  // before promoting the new address.
  if (v.isDefault) {
    await supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("user_id", session.user.id)
      .eq("is_default", true);
  }

  const payload = {
    user_id: session.user.id,
    label: v.label,
    contact_name: v.contactName,
    contact_phone: v.contactPhone,
    address_line: v.addressLine,
    building: v.building ?? null,
    floor: v.floor ?? null,
    apartment: v.apartment ?? null,
    landmark: v.landmark ?? null,
    area: v.area ?? null,
    city: v.city,
    notes: v.notes ?? null,
    latitude: v.latitude ?? null,
    longitude: v.longitude ?? null,
    accuracy_m: v.accuracyM ?? null,
    is_default: v.isDefault,
  };

  const result = v.id
    ? await supabase
        .from("addresses")
        .update(payload)
        .eq("id", v.id)
        .eq("user_id", session.user.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("addresses").insert(payload).select("id").single();

  if (result.error || !result.data) {
    return actionError(result.error ?? new Error("Address was not saved"));
  }

  await logActivity(supabase, {
    userId: session.user.id,
    event: "ADDRESS_SAVED",
    entity: "addresses",
    entityId: result.data.id,
  });

  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return actionOk({ id: result.data.id });
}

export async function deleteAddressAction(
  addressId: string,
): Promise<FormActionResult<undefined>> {
  const session = await requireUser("/account/addresses");
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("addresses")
    .delete()
    .eq("id", addressId)
    .eq("user_id", session.user.id);

  if (error) return actionError(error);

  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return actionOk();
}

export async function setDefaultAddressAction(
  addressId: string,
): Promise<FormActionResult<undefined>> {
  const session = await requireUser("/account/addresses");
  const supabase = await createServerSupabase();

  await supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", session.user.id)
    .eq("is_default", true);

  const { error } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", addressId)
    .eq("user_id", session.user.id);

  if (error) return actionError(error);

  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return actionOk();
}

export async function updateProfileAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await requireUser("/account");

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    locale: formData.get("locale") || "en",
    marketingOptIn: formData.get("marketingOptIn") === "on",
    notificationsOptIn: formData.get("notificationsOptIn") === "on",
  });

  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      locale: parsed.data.locale,
      marketing_opt_in: parsed.data.marketingOptIn,
      notifications_opt_in: parsed.data.notificationsOptIn,
    })
    .eq("id", session.user.id);

  if (error) return actionError(error);

  await logActivity(supabase, {
    userId: session.user.id,
    event: "PROFILE_UPDATED",
    entity: "profiles",
    entityId: session.user.id,
  });

  revalidatePath("/account");
  return actionOk();
}
