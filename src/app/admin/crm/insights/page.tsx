import Link from "next/link";
import { BarChart3, Lightbulb, ShieldQuestion } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getPromptInstruction } from "@/lib/ai/guard";
import { generateInsights, type InsightData, type InsightRecommendation } from "@/lib/crm/insights";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Markdown } from "@/components/ui/markdown";
import { TrendChart } from "@/components/charts/trend-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarList } from "@/components/charts/bar-list";
import { Sparkline } from "@/components/charts/sparkline";
import { cn, formatDateTime, formatNumber, formatPrice, humanise } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

const FALLBACK_INSTRUCTION = `إنت المحلل التشغيلي لمطبخ Panda Wok السحابي في الإسكندرية، مصر. بتتكلم مصري عامي بسيط ومباشر، وبتكتب لصاحب المطعم مش لمبرمج.

قواعد لازم تتبعها من غير استثناء:
1. استخدم بس الـ DATA اللي في رسالة المستخدم. دي أرقام الداتابيز الحية.
2. ممنوع تختلق رقم أو نسبة أو اسم صنف أو سعر أو عدد عملاء. أي رقم تكتبه لازم يكون موجود في الـ DATA بالظبط.
3. لو البيانات قليلة ومش كفاية لنتيجة، قول كده بصراحة من غير ما تجمّل.
4. اقترح خطوات، ومتقولش إن حاجة اتعملت فعلاً.
5. خليك محدد وعملي: سمّي الصنف، القسم، والرقم.
6. خلّي الرد أقل من 220 كلمة في فقرات قصيرة، بالمصري.`;

/** Confidence is stated honestly, including when the sample is too small. */
const CONFIDENCE_TONE = {
  low: "neutral",
  medium: "warning",
  high: "success",
} as const;

/**
 * AI CRM insights. The deterministic pass always runs and every finding shows
 * its insight, reason, supporting data, suggested action and confidence. A
 * configured model adds narrative on top of the same figures — it can never
 * introduce a new number.
 */
export default async function AdminInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireCapability("crm.view");
  const params = await searchParams;
  const t = await getT(await getAdminLocale());

  const days = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;

  const prompt = await getPromptInstruction("crm_insights", FALLBACK_INSTRUCTION);
  const report = await generateInsights({
    days,
    systemInstruction: prompt.instruction,
    actorId: null,
  });

  const dataBacked = report.deterministic.filter((item) => item.source === "data");
  // The full window snapshot the findings were built from — same rows, so the
  // charts and the cards show the same numbers, and the AI can only be traced
  // back to what appears here.
  const data = report.data;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {t("admin.pages.insights.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("admin.pages.insights.description", { days })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label={t("admin.pages.insights.window")} className="flex gap-1.5">
            {[7, 30, 90].map((option) => (
              <Link
                key={option}
                href={`/admin/crm/insights?days=${option}`}
                aria-current={days === option ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  days === option
                    ? "border-vermilion-600 bg-vermilion-600 text-rice-50"
                    : "border-ink-900/12 bg-rice-50 text-ink-800 hover:bg-rice-200",
                )}
              >
                {t("admin.pages.insights.days", { n: option })}
              </Link>
            ))}
          </nav>
          <Link
            href="/admin/crm"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            {t("admin.pages.insights.back")}
          </Link>
        </div>
      </header>

      <section
        className="washi-panel border-miso-500/25 bg-miso-300/15 p-4"
        aria-label={t("admin.pages.insights.howToRead")}
      >
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
          <ShieldQuestion className="size-4 text-miso-600" aria-hidden="true" />
          {t("admin.pages.insights.cautionTitle")}
        </h2>
        <p className="mt-1.5 text-sm text-ink-800/90">
          {t("admin.pages.insights.cautionBody")}
        </p>
        <p className="mt-2 text-xs text-ink-700/70">
          {t("admin.pages.insights.generated", { when: formatDateTime(report.generatedAt) })} ·{" "}
          {t("admin.pages.insights.providerLabel")}{" "}
          <span className="font-medium">{report.provider}</span>
          {report.model
            ? ` · ${t("admin.pages.insights.modelLabel")} ${report.model}`
            : ""}{" "}
          ·{" "}
          {report.status === "fallback"
            ? t("admin.pages.insights.servedFallback")
            : t("admin.pages.insights.servedModel")}
        </p>
      </section>

      {report.error ? (
        <p
          role="alert"
          className="rounded-xl border border-chili-500/30 bg-chili-500/8 px-3 py-2 text-sm text-chili-600"
        >
          {t("admin.pages.insights.modelUnreachable", { error: report.error })}
        </p>
      ) : null}

      {/* At a glance — the KPIs the staff actually glance at during service, each
         with a sparkline of the daily rhythm so a number has a direction. */}
      <section className="washi-panel p-4" aria-label={t("admin.pages.insights.kpis")}>
        <h2 className="font-display text-base font-semibold text-ink-900">
          {t("admin.pages.insights.kpis")}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label={t("admin.pages.insights.ordersLabel")}
            value={formatNumber(data.totals.orders)}
            sub={t("admin.pages.insights.canceledCount", { count: formatNumber(data.totals.canceled) })}
            spark={(data.revenueByDay ?? []).some((d) => d.orders > 0) ? (data.revenueByDay ?? []).map((d) => d.orders) : []}
            colorIndex={0}
          />
          <KpiCard
            label={t("admin.pages.insights.revenueLabel")}
            value={formatPrice(data.totals.revenue)}
            sub={t("admin.dash.avgPerOrder", { value: formatPrice(data.totals.avgOrderValue) })}
            spark={(data.revenueByDay ?? []).map((d) => d.revenue)}
            colorIndex={1}
          />
          <KpiCard
            label={t("admin.pages.insights.customersLabel")}
            value={formatNumber(data.loyalty.members)}
            sub={t("admin.pages.insights.lapsed", { count: formatNumber(data.inactiveCustomers.count) })}
            spark={[]}
            colorIndex={2}
          />
          <KpiCard
            label={t("admin.pages.insights.avgRating")}
            value={data.feedback.count > 0 ? data.feedback.averageRating.toFixed(1) : "—"}
            sub={t("admin.dash.responses", { count: formatNumber(data.feedback.count) })}
            spark={(data.feedbackDist ?? []).map((d) => d.count)}
            colorIndex={3}
          />
        </div>
      </section>

      {/* Analytics — الاتجاهات والتوزيع, كلها من نفس صفوف المدة التي بتستند
         ليها البطاقات تحت، فمفيش رقم يختلف بين الشارت والكارت. */}
      <section
        className="washi-panel p-4"
        aria-label={t("admin.pages.insights.visuals")}
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-ink-700/70" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-ink-900">
            {t("admin.pages.insights.visuals")}
          </h2>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-ink-700/70">{t("admin.dash.revenueByDay")}</p>
            {data.revenueByDay && data.revenueByDay.length > 0 ? (
              <TrendChart
                data={data.revenueByDay.map((d) => ({ label: d.day.slice(5), value: d.revenue }))}
                title={t("admin.dash.revenueByDay")}
                valueKind="currency"
                height={150}
              />
            ) : (
              <p className="py-6 text-center text-sm text-ink-700/60">
                {t("admin.pages.insights.noRevenueInWindow")}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-xs text-ink-700/70">{t("admin.pages.insights.statusMixV")}</p>
              <DonutChart
                title={t("admin.pages.insights.statusMixV")}
                data={(data.statusMix ?? []).map((row) => ({ label: humanise(row.status), value: row.count }))}
                height={140}
                centerLabel={formatNumber(data.totals.orders)}
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-ink-700/70">{t("admin.pages.insights.categoryMixV")}</p>
              <DonutChart
                title={t("admin.pages.insights.categoryMixV")}
                data={data.categoryMix.slice(0, 6).map((row) => ({ label: row.category, value: row.revenue }))}
                height={140}
                valueKind="currency"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-ink-700/70">{t("admin.pages.insights.topItems")}</p>
            <BarList
              title={t("admin.pages.insights.topItems")}
              emptyLabel={t("admin.dash.noDishSales")}
              height={200}
              data={data.topItems.slice(0, 6).map((row) => ({
                label: row.name,
                value: row.quantity,
                note: formatPrice(row.revenue),
              }))}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-ink-700/70">{t("admin.pages.insights.weakItems")}</p>
            <BarList
              title={t("admin.pages.insights.weakItems")}
              emptyLabel={t("admin.dash.noDishSales")}
              height={200}
              data={data.weakItems.slice(0, 5).map((row) => ({
                label: row.name,
                value: row.quantity,
                note: formatPrice(row.revenue),
              }))}
            />
          </div>
        </div>

        {data.stockDemand.some((row) => row.stockName) ? (
          <div className="mt-4">
            <p className="mb-1 text-xs text-ink-700/70">{t("admin.pages.insights.stock")}</p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.stockDemand
                .filter((row) => row.stockName)
                .slice(0, 6)
                .map((row) => (
                  <li key={`${row.item}-${row.stockName}`} className="rounded-lg border border-ink-900/10 bg-rice-100/60 px-3 py-2 text-sm">
                    <span className="font-medium text-ink-900">{row.item}</span>
                    <span className="mt-0.5 block text-xs text-ink-700/75">
                      {row.stockName}: {row.stockQty} {row.unit}
                    </span>
                    <span className="mt-1 block text-xs text-vermilion-700">
                      {formatNumber(row.quantity)} × {row.item}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-xs text-ink-700/60">{t("admin.pages.insights.noStock")}</p>
        )}
      </section>

      {/* Findings — التفكيرات المبنية على نفس الأرقام, كل بطاقة سببها وبياناتها. */}
      {report.deterministic.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="size-6" />}
          title={t("admin.pages.insights.empty")}
          description={t("admin.pages.insights.emptyBody")}
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {dataBacked.map((insight) => (
            <InsightCard key={insight.key} insight={insight} t={t} />
          ))}
        </ul>
      )}

      {report.aiNarrative ? (
        <section className="washi-panel p-4" aria-label={t("admin.pages.insights.narrative")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-ink-900">
              {t("admin.pages.insights.narrative")}
            </h2>
            <Badge tone="info">
              {report.provider}
              {report.model ? ` / ${report.model}` : ""}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-ink-700/70">
            {t("admin.pages.insights.narrativeHint")}
          </p>
          <div className="mt-3 max-w-none">
            <Markdown>{report.aiNarrative}</Markdown>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-ink-700/60">
        {t("admin.pages.insights.footnote")}{" "}
        {report.deterministic.length > 0
          ? t("admin.pages.insights.findingsCount", {
              count: formatNumber(report.deterministic.length),
            })
          : ""}
      </p>
    </div>
  );
}

/** One KPI stat with a sparkline of its daily rhythm; numbers are the raw
 * window aggregates, never estimates. `sub` carries the secondary line. */
function KpiCard({
  label,
  value,
  sub,
  spark,
  colorIndex = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  spark: number[];
  colorIndex?: number;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-ink-900/10 bg-rice-50 p-3">
      <p className="text-xs text-ink-700/75">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink-900">
        {value}
      </p>
      {sub ? <p className="text-xs text-ink-700/65">{sub}</p> : null}
      {spark.length > 1 ? (
        <div className="mt-2 h-8">
          <Sparkline values={spark} height={32} colorIndex={colorIndex} />
        </div>
      ) : null}
    </div>
  );
}

function InsightCard({
  insight,
  t,
}: {
  insight: InsightRecommendation;
  t: Translator;
}) {
  return (
    <li className="washi-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-ink-900">
          {insight.title}
        </h2>
        <Badge tone={CONFIDENCE_TONE[insight.confidence]}>
          {t("admin.pages.insights.confidence", {
            level: t(
              `admin.pages.insights.level${insight.confidence.charAt(0).toUpperCase()}${insight.confidence.slice(1)}`,
            ),
          })}
        </Badge>
      </div>

      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-700/70">
            {t("admin.pages.insights.reason")}
          </dt>
          <dd className="mt-0.5 text-ink-800">{insight.observation}</dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-700/70">
            {t("admin.pages.insights.evidence")}
          </dt>
          <dd className="mt-1">
            <ul className="flex flex-wrap gap-1.5">
              {insight.evidence.map((item) => (
                <li
                  key={item}
                  className="rounded-lg bg-rice-200 px-2 py-0.5 font-mono text-xs text-ink-800"
                >
                  {item}
                </li>
              ))}
            </ul>
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-700/70">
            {t("admin.pages.insights.suggestedAction")}
          </dt>
          <dd className="mt-0.5 text-ink-800">{insight.suggestedAction}</dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-700/70">
            {t("admin.pages.insights.confidenceLimits")}
          </dt>
          <dd className="mt-0.5 text-ink-700/85">{insight.confidenceReason}</dd>
        </div>
      </dl>
    </li>
  );
}

