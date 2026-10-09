"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminButtonAction } from "@/components/admin/form-kit";
import { refreshPublicCacheAction } from "@/lib/actions/admin";
import { useI18n } from "@/components/i18n-provider";

/**
 * Force-refresh the storefront's public data cache.
 *
 * The storefront caches menu/settings/content for a short window so a rush is
 * served by the CDN rather than the database. Admin edits revalidate their slice
 * automatically, and the Pages front door purges its HTML cache on any admin
 * POST — so this button is for the one case those miss: a change made directly
 * in the database. Without it, an owner who edits a row by hand (or a migration
 * that adds menu options) can wait out the TTL before the site shows it.
 */
export function CacheRefreshControl() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);

  return (
    <section className="washi-panel p-4" aria-label={t("admin.pages.settings.cache.title")}>
      <h2 className="font-display text-lg font-semibold text-ink-900">
        {t("admin.pages.settings.cache.title")}
      </h2>
      <p className="mt-1 text-sm text-ink-700/80">{t("admin.pages.settings.cache.body")}</p>
      <div className="mt-3">
        <AdminButtonAction
          action={async () => {
            const result = await refreshPublicCacheAction();
            if (result.ok) setDone(true);
            return result;
          }}
          variant="secondary"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {t("admin.pages.settings.cache.refresh")}
        </AdminButtonAction>
      </div>
      {done ? (
        <p role="status" className="mt-2 text-xs text-jade-700">
          {t("admin.pages.settings.cache.refreshed")}
        </p>
      ) : null}
    </section>
  );
}
