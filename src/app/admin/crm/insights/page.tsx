import Link from "next/link";
import { Lightbulb, ShieldQuestion } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getPromptInstruction } from "@/lib/ai/guard";
import { generateInsights, type InsightRecommendation } from "@/lib/crm/insights";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatDateTime, formatNumber } from "@/lib/utils/format";
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

      {report.deterministic.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="size-6" />}
          title={t("admin.pages.insights.empty")}
          description={t("admin.pages.insights.emptyBody")}
        />
      ) : (
        <ul className="space-y-4">
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
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink-800">
            {report.aiNarrative
              .split(/\n{2,}/)
              .filter((paragraph) => paragraph.trim())
              .map((paragraph, index) => (
                <p key={index}>{paragraph.trim()}</p>
              ))}
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

