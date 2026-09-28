import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import {
  listAdminCategories,
  listAdminMenuItems,
  listUpsellRules,
} from "@/lib/services/admin-catalog";
import { UpsellRuleForm } from "@/components/admin/upsell-form";
import { UpsellRuleList } from "@/components/admin/upsell-list";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Upsell rules. Suggestions are contextual — one clear nudge tied to what is
 * already in the basket converts far better than stacking several offers.
 */
export default async function AdminUpsellPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireCapability("menu.manage");
  const t = await getT(await getAdminLocale());
  const params = await searchParams;

  const [rules, items, categories] = await Promise.all([
    listUpsellRules(),
    listAdminMenuItems(),
    listAdminCategories(),
  ]);

  const editing = params.edit
    ? (rules.find((rule) => rule.id === params.edit) ?? null)
    : null;

  const itemOptions = items.map((item) => ({ id: item.id, name_en: item.name_en }));
  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name_en: category.name_en,
  }));

  const itemById = new Map(itemOptions.map((item) => [item.id, item.name_en]));
  const categoryById = new Map(
    categoryOptions.map((category) => [category.id, category.name_en]),
  );
  const lookup = {
    itemName: (id: string | null) => (id ? (itemById.get(id) ?? null) : null),
    categoryName: (id: string | null) => (id ? (categoryById.get(id) ?? null) : null),
  };

  const active = rules.filter(
    (rule) => rule.is_enabled,
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">{t("admin.pages.upsell.title")}</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("admin.pages.upsell.description")}
          </p>
        </div>
        {params.edit ? (
          <Link
            href="/admin/upsell"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            {t("admin.pages.upsell.new")}
          </Link>
        ) : null}
      </header>

      <p className="washi-panel p-3 text-sm text-ink-800">
        {t("admin.pages.upsell.notice")}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section
          className="washi-panel p-4"
          aria-label={editing ? t("admin.pages.upsell.edit") : t("admin.pages.upsell.add")}
        >
          <h2 className="font-display text-lg font-semibold text-ink-900">
            {editing ? `${t("admin.pages.upsell.edit")} ${editing.name}` : t("admin.pages.upsell.add")}
          </h2>
          <p className="mt-1 text-sm text-ink-700/75">
            {editing
              ? "Change the trigger, the suggestion, the copy or the priority, then save."
              : "Pick what triggers the suggestion, what to offer, and how loudly it should be tried."}
          </p>
          <div className="mt-4">
            <UpsellRuleForm
              rule={editing}
              items={itemOptions}
              categories={categoryOptions}
            />
          </div>
        </section>

        <section aria-label="All upsell rules">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink-900">
              Rules{" "}
              <span className="text-sm font-normal text-ink-700/60">
                ({formatNumber(rules.length)})
              </span>
            </h2>
            <span className="text-xs text-ink-700/70">
              {formatNumber(active)} active
            </span>
          </div>

          {rules.length === 0 ? (
            <EmptyState
              title={t("admin.pages.upsell.empty")}
              description={t("admin.pages.upsell.emptyBody")}
            />
          ) : (
            <UpsellRuleList rules={rules} lookup={lookup} />
          )}
        </section>
      </div>
    </div>
  );
}
