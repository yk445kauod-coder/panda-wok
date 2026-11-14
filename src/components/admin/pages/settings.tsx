"use client";

import {
  FeatureFlagToggle,
  SettingsForm,
  type FeatureFlagRow,
  type SettingRow,
} from "@/components/admin/settings-forms";
import { StoreHoursControl } from "@/components/admin/store-hours-control";
import { CacheRefreshControl } from "@/components/admin/cache-refresh-control";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";
import { PageError, PageLoading } from "@/components/admin/page-states";
import { useAdminData } from "@/lib/admin/client";
import { useT } from "@/components/i18n-provider";
import type { Database } from "@/lib/types/database";
import type { StoreHours } from "@/lib/services/store-hours";

type SettingsPayload = {
  flags: Database["public"]["Tables"]["feature_flags"]["Row"][];
  settings: Database["public"]["Tables"]["settings"]["Row"][];
  acceptingOrders: boolean;
  hours: StoreHours;
};

/**
 * Platform settings. Flags gate whole modules; the settings below hold the
 * business rules that the order-placement function reads on every checkout.
 * The values arrive from `/api/admin/settings`.
 */
export function SettingsPage() {
  const t = useT();

  const { data, loading, error } = useAdminData<SettingsPayload>("/api/admin/settings");

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <PageError message={error} />;
  if (!data) return <PageError message={error} />;

  const flagRows = data.flags as unknown as FeatureFlagRow[];
  const settingRows = data.settings as unknown as SettingRow[];

  const enabledFlags = flagRows.filter((flag) => flag.is_enabled).length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">{t("admin.pages.settings.title")}</h1>
        <p className="mt-1 text-sm text-ink-700/80">
          {t("admin.pages.settings.description")}
        </p>
      </header>

      <StoreHoursControl
        acceptingOrders={data.acceptingOrders}
        hours={data.hours}
      />

      <section aria-label={t("admin.pages.settings.flags")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            {t("admin.pages.settings.flags")}{" "}
            <span className="text-sm font-normal text-ink-700/60">
              ({formatNumber(enabledFlags)} {t("admin.pages.settings.on")}{" "}
              {formatNumber(flagRows.length)})
            </span>
          </h2>
        </div>

        <p className="mb-3 text-sm text-ink-700/80">
          {t("admin.pages.settings.flagsHint")}
        </p>

        {flagRows.length === 0 ? (
          <EmptyState
            title={t("admin.pages.settings.noFlags")}
            description={t("admin.pages.settings.noFlagsBody")}
          />
        ) : (
          <ul className="space-y-2">
            {flagRows.map((flag) => (
              <FeatureFlagToggle key={flag.key} flag={flag} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t("admin.pages.settings.business")}>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">
          {t("admin.pages.settings.business")}
        </h2>

        <p className="mb-3 text-sm text-ink-700/80">
          {t("admin.pages.settings.businessHint")}
        </p>

        {settingRows.length === 0 ? (
          <EmptyState
            title={t("admin.pages.settings.noSettings")}
            description={t("admin.pages.settings.noSettingsBody")}
          />
        ) : (
          <SettingsForm settings={settingRows} />
        )}
      </section>

      <CacheRefreshControl />
    </div>
  );
}
