"use client";

import { useT } from "@/components/i18n-provider";

/**
 * Shared states for the console SPA pages. Each page fetches its own data, so
 * these are what render while a request is in flight or when it fails — the
 * client-side counterparts of the old `loading.tsx` and `error.tsx`.
 */
export function PageLoading() {
  const t = useT();
  return (
    <div className="grid place-items-center py-20" role="status" aria-live="polite">
      <span
        aria-hidden="true"
        className="size-7 animate-spin rounded-full border-2 border-ink-900/15 border-t-vermilion-600"
      />
      <span className="sr-only">{t("admin.common.loading")}</span>
    </div>
  );
}

export function PageError({ message }: { message?: string | null }) {
  const t = useT();
  return (
    <div className="washi-panel p-6 text-center">
      <p className="font-display text-base font-semibold text-ink-900">
        {t("admin.common.errorTitle")}
      </p>
      <p className="mt-1 text-sm text-ink-700/80">
        {message ?? t("admin.common.errorBody")}
      </p>
    </div>
  );
}
