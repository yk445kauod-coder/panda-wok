"use client";

import { BookOpen, Check, Minus } from "lucide-react";
import {
  capabilitiesFor,
  type Capability,
  type StaffRole,
} from "@/lib/auth/rbac";
import { GUIDE_ROLE_ORDER, GUIDE_TOPICS, GUIDE_SECTIONS } from "@/lib/admin/guide";
import { localiseGuideSections } from "@/lib/admin/guide.ar";
import { GuideBrowser } from "@/components/admin/guide-browser";
import { PageHeader } from "@/components/ui/page-header";
import { PageError, PageLoading } from "@/components/admin/page-states";
import { useAdminData } from "@/lib/admin/client";
import { useI18n, useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils/format";

/** Capability → dictionary key under `admin.guide.capability.*`, for the table. */
const CAPABILITY_LABEL_KEYS: Record<string, string> = {
  "orders.view": "ordersView",
  "orders.update": "ordersUpdate",
  "kitchen.view": "kitchenView",
  "menu.manage": "menuManage",
  "crm.view": "crmView",
  "crm.export": "crmExport",
  "users.manage": "usersManage",
  "feedback.manage": "feedbackManage",
  "analytics.view": "analyticsView",
  "ai.manage": "aiManage",
  "exports.manage": "exportsManage",
  "backups.view": "backupsView",
  "backups.create": "backupsCreate",
  "backups.restore": "backupsRestore",
  "settings.manage": "settingsManage",
  "roles.manage": "rolesManage",
};

/**
 * The ops manual. It opens for any unlocked member — unlike every other admin
 * screen it is not capability-gated, because its whole purpose is to tell a
 * member what they can and cannot do. The role table below is generated from the
 * live capability matrix, so it can never drift from what the server enforces.
 * The acting role arrives from `/api/admin/guide`.
 */
export function GuidePage() {
  const t = useT();
  const { locale } = useI18n();

  const { data, loading, error } = useAdminData<{ role: StaffRole; capabilities: Capability[] }>(
    "/api/admin/guide",
  );

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <PageError message={error} />;

  const capabilities = data?.capabilities ?? [];
  const activeRole: StaffRole | null = data?.role ?? null;

  // Guide copy is bilingual; the structure (ids, icons, capabilities) is shared.
  const sections = localiseGuideSections(GUIDE_SECTIONS, locale);

  // Union of every capability any role holds, so the table is complete.
  const allCapabilities = [...new Set(GUIDE_ROLE_ORDER.flatMap((role) => capabilitiesFor(role)))];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("admin.guide.eyebrow")}
        title={t("admin.guide.title")}
        description={t("admin.guide.description")}
      />

      <div className="flex items-center gap-2 rounded-xl border border-ink-900/10 bg-rice-50 p-3 text-sm text-ink-700">
        <BookOpen className="size-4 shrink-0 text-vermilion-600" aria-hidden="true" />
        <span>
          {t("admin.guide.topicCount", { count: GUIDE_TOPICS.length })}{" "}
          {t("admin.guide.youAre")}{" "}
          <strong className="font-medium text-ink-900">
            {activeRole ? t(`admin.term.role.${activeRole}`) : t("admin.guide.unrecognised")}
          </strong>
          {activeRole ? ` — ${t(`admin.guide.roleDescription.${activeRole}`)}` : "."}
        </span>
      </div>

      <GuideBrowser capabilities={capabilities} sections={sections} />

      <section aria-labelledby="role-matrix" className="space-y-3">
        <div>
          <h2 id="role-matrix" className="font-display text-lg font-semibold text-ink-900">
            {t("admin.guide.roleMatrix")}
          </h2>
          <p className="mt-0.5 text-sm text-ink-700/80">
            {t("admin.guide.roleMatrixHint")}
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-ink-900/10 bg-rice-50">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-900/10">
                <th scope="col" className="p-3 text-start font-medium text-ink-700">
                  {t("admin.guide.permission")}
                </th>
                {GUIDE_ROLE_ORDER.map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className={cn(
                      "p-3 text-center text-xs font-semibold uppercase tracking-wide",
                      role === activeRole ? "text-vermilion-700" : "text-ink-600",
                    )}
                  >
                    {t(`admin.term.role.${role}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allCapabilities.map((capability) => (
                <tr key={capability} className="border-b border-ink-900/6 last:border-0">
                  <th scope="row" className="p-3 text-start font-normal text-ink-800">
                    {t(`admin.guide.capability.${CAPABILITY_LABEL_KEYS[capability] ?? "unknown"}`)}
                  </th>
                  {GUIDE_ROLE_ORDER.map((role) => {
                    const allowed = capabilitiesFor(role).includes(capability);
                    return (
                      <td
                        key={role}
                        className={cn("p-3 text-center", role === activeRole ? "bg-vermilion-600/4" : "")}
                      >
                        {allowed ? (
                          <Check className="mx-auto size-4 text-jade-600" aria-label={t("admin.guide.allowed")} />
                        ) : (
                          <Minus className="mx-auto size-4 text-ink-400" aria-label={t("admin.guide.notAllowed")} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
