import Link from "next/link";
import { Lightbulb, ShieldQuestion } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getPromptInstruction } from "@/lib/ai/guard";
import { generateInsights, type InsightRecommendation } from "@/lib/crm/insights";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatDateTime, formatNumber } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const FALLBACK_INSTRUCTION = `You are the operations analyst for Panda Wok, a cloud kitchen in Alexandria, Egypt.

Rules you must follow without exception:
1. Use ONLY the DATA block in the user message. It is the live database aggregate.
2. Never invent a statistic, percentage, dish, price or customer count.
3. If the DATA block is too thin to support a conclusion, say so plainly.
4. Suggest actions; never state that an action has been taken.
5. Be specific and operational: name the dish, the segment, the number.
6. Keep it under 220 words in short paragraphs.`;

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
          <h1 className="text-2xl font-semibold text-ink-900">AI insights</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Findings computed from live order, loyalty, stock and feedback rows for the last{" "}
            {days} days.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Window" className="flex gap-1.5">
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
                {option}d
              </Link>
            ))}
          </nav>
          <Link
            href="/admin/crm"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            Back to CRM
          </Link>
        </div>
      </header>

      <section
        className="washi-panel border-miso-500/25 bg-miso-300/15 p-4"
        aria-label="How to read these insights"
      >
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
          <ShieldQuestion className="size-4 text-miso-600" aria-hidden="true" />
          These are suggestions, not decisions
        </h2>
        <p className="mt-1.5 text-sm text-ink-800/90">
          Every figure below is computed from the database for the stated window. The system
          proposes actions for a human to weigh — it never changes prices, stock or marketing
          on its own. Where the sample is small, the confidence line says so.
        </p>
        <p className="mt-2 text-xs text-ink-700/70">
          Generated {formatDateTime(report.generatedAt)} · provider{" "}
          <span className="font-medium">{report.provider}</span>
          {report.model ? ` · model ${report.model}` : ""} ·{" "}
          {report.status === "fallback"
            ? "served deterministically from database rules"
            : "model narrative on top of the same data"}
        </p>
      </section>

      {report.error ? (
        <p
          role="alert"
          className="rounded-xl border border-chili-500/30 bg-chili-500/8 px-3 py-2 text-sm text-chili-600"
        >
          The model could not be reached ({report.error}), so the deterministic findings are
          shown. They are complete on their own.
        </p>
      ) : null}

      {report.deterministic.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="size-6" />}
          title="Not enough data for insights yet"
          description="Insights need a window of real orders to be meaningful. Once orders and feedback accumulate, findings appear here with the numbers behind them."
        />
      ) : (
        <ul className="space-y-4">
          {dataBacked.map((insight) => (
            <InsightCard key={insight.title} insight={insight} />
          ))}
        </ul>
      )}

      {report.aiNarrative ? (
        <section className="washi-panel p-4" aria-label="Model narrative">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-ink-900">
              Model narrative
            </h2>
            <Badge tone="info">
              {report.provider}
              {report.model ? ` / ${report.model}` : ""}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-ink-700/70">
            A rephrasing of the same figures above. It introduces no new data.
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
        Confidence reflects sample size and how directly the rule maps to the data. It is not
        a statistical guarantee.{" "}
        {report.deterministic.length > 0
          ? `${formatNumber(report.deterministic.length)} findings in this window.`
          : ""}
      </p>
    </div>
  );
}

function InsightCard({ insight }: { insight: InsightRecommendation }) {
  return (
    <li className="washi-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-ink-900">
          {insight.title}
        </h2>
        <Badge tone={CONFIDENCE_TONE[insight.confidence]}>
          {insight.confidence} confidence
        </Badge>
      </div>

      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-700/70">
            Reason
          </dt>
          <dd className="mt-0.5 text-ink-800">{insight.observation}</dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-700/70">
            Relevant data
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
            Suggested action
          </dt>
          <dd className="mt-0.5 text-ink-800">{insight.suggestedAction}</dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-700/70">
            Confidence &amp; limitations
          </dt>
          <dd className="mt-0.5 text-ink-700/85">{insight.confidenceReason}</dd>
        </div>
      </dl>
    </li>
  );
}

