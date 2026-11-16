"use client";

import { useT } from "@/components/i18n-provider";

/**
 * Shared loading and error states for the storefront's client pages.
 *
 * The pages are static shells now and fetch their own data, so these are the
 * client-side counterparts of the old `loading.tsx` / `error.tsx` — the same
 * spinner and panel the console uses, with storefront copy.
 */
export function PageLoading() {
  const t = useT();
  return (
    <div className="grid place-items-center py-24" role="status" aria-live="polite">
      <span
        aria-hidden="true"
        className="size-7 animate-spin rounded-full border-2 border-ink-900/15 border-t-vermilion-600"
      />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

export function PageError({ message }: { message?: string | null }) {
  const t = useT();
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="font-display text-lg font-semibold text-ink-900">
        {t("errors.serverTitle")}
      </p>
      <p className="mt-1.5 text-sm text-ink-700/80">{message ?? t("errors.serverBody")}</p>
    </div>
  );
}
