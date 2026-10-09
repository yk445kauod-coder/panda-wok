import type { Locale } from "@/lib/i18n/config";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { en } from "@/lib/i18n/dictionaries/en";
import { makeTranslator } from "@/lib/i18n/translate";
import { humanise } from "@/lib/utils/format";

/**
 * Translations for values that arrive from the database as enum tokens
 * (`in_progress`, `out_for_delivery`, `card_on_delivery`, `gold`, …). These are
 * distinct from the customer-facing wording in `i18n/orders.ts`: the console
 * wants short operational labels ("Preparing"), not the warm sentences a
 * customer reads ("Preparing your food").
 *
 * Translation is per call site rather than per module so a server component can
 * pass its resolved locale and a client component can pass the hook's locale.
 */
function translator(locale: Locale) {
  return makeTranslator(locale === "ar" ? ar : en);
}

/**
 * Look up `admin.term.<group>.<token>` and fall back to the humanised token.
 * The fallback is deliberate: an unmapped enum value still renders something
 * readable instead of a raw key path, which is the silent failure mode we keep
 * hitting when a dictionary key goes missing.
 */
function term(locale: Locale, group: string, token: string | null | undefined): string {
  if (!token) return "—";
  const t = translator(locale);
  const key = `admin.term.${group}.${token}`;
  const value = t(key);
  return value === key ? humanise(token) : value;
}

export function orderStatusLabel(locale: Locale, status: string) {
  return term(locale, "orderStatus", status);
}

export function paymentStatusLabel(locale: Locale, status: string) {
  return term(locale, "paymentStatus", status);
}

export function fulfilmentLabel(locale: Locale, value: string) {
  return term(locale, "fulfilment", value);
}

export function paymentMethodLabel(locale: Locale, value: string) {
  return term(locale, "paymentMethod", value);
}

export function roleLabel(locale: Locale, role: string) {
  return term(locale, "role", role);
}

export function tierLabel(locale: Locale, tier: string) {
  return term(locale, "tier", tier);
}

export function stockStatusLabel(locale: Locale, status: string) {
  return term(locale, "stockStatus", status);
}

export function feedbackStatusLabel(locale: Locale, status: string) {
  return term(locale, "feedbackStatus", status);
}

export function exportKindLabel(locale: Locale, kind: string) {
  return term(locale, "exportKind", kind);
}

export function humaniseLocalised(locale: Locale, group: string, token: string) {
  return term(locale, group, token);
}
