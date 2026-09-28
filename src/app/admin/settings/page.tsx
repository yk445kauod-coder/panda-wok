import { requireCapability } from "@/lib/auth/session";
import { listFeatureFlags, listSettings } from "@/lib/services/admin-catalog";
import {
  FeatureFlagToggle,
  SettingsForm,
  type FeatureFlagRow,
  type SettingRow,
} from "@/components/admin/settings-forms";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Platform settings. Flags gate whole modules; the settings below hold the
 * business rules that the order-placement function reads on every checkout.
 */
export default async function AdminSettingsPage() {
  await requireCapability("settings.manage");

  const t = await getT(await getAdminLocale());
  const [flags, settings] = await Promise.all([listFeatureFlags(), listSettings()]);

  const flagRows = flags as unknown as FeatureFlagRow[];
  const settingRows = settings as unknown as SettingRow[];

  const enabledFlags = flagRows.filter((flag) => flag.is_enabled).length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">{t("admin.pages.settings.title")}</h1>
        <p className="mt-1 text-sm text-ink-700/80">
          {t("admin.pages.settings.description")}
        </p>
      </header>

      <section aria-label={t("admin.pages.settings.flags")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Feature flags{" "}
            <span className="text-sm font-normal text-ink-700/60">
              ({formatNumber(enabledFlags)} of {formatNumber(flagRows.length)} {t("admin.pages.settings.on")})
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

      <section aria-label="Business settings">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">
          {t("admin.pages.settings.business")}
        </h2>

        <p className="mb-3 text-sm text-ink-700/80">
          Values are stored as jsonb, grouped by the prefix before the first dot. The numeric
          rules —{" "}
          <code className="rounded bg-ink-900/8 px-1 py-0.5 text-xs">delivery.fee</code>,{" "}
          <code className="rounded bg-ink-900/8 px-1 py-0.5 text-xs">
            delivery.free_over
          </code>
          , <code className="rounded bg-ink-900/8 px-1 py-0.5 text-xs">tax.rate</code>,{" "}
          <code className="rounded bg-ink-900/8 px-1 py-0.5 text-xs">
            ordering.min_order_total
          </code>
          ,{" "}
          <code className="rounded bg-ink-900/8 px-1 py-0.5 text-xs">
            ordering.max_qty_per_item
          </code>{" "}
          and{" "}
          <code className="rounded bg-ink-900/8 px-1 py-0.5 text-xs">
            loyalty.points_per_currency
          </code>{" "}
          — are read by the server-side order placement function, so a wrong number here
          bills real customers wrongly. Change them deliberately.
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
    </div>
  );
}
