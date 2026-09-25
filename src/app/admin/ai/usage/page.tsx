import { requireCapability } from "@/lib/auth/session";
import { getAiUsage } from "@/lib/crm/insights";
import { listAiRequests } from "@/lib/services/admin-catalog";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RunStatusBadge } from "@/components/admin/run-status";
import { cn, formatDateTime, formatNumber, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * AI usage and logs. Every number comes from ai_requests / ai_usage_daily —
 * nothing is estimated beyond the provider-reported token counts.
 */
export default async function AdminAiUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; provider?: string }>;
}) {
  await requireCapability("ai.manage");
  const params = await searchParams;

  const [usage, requests] = await Promise.all([getAiUsage(30), listAiRequests(200)]);

  const statuses = [...new Set(requests.map((row) => row.status))];
  const providers = [...new Set(requests.map((row) => row.provider ?? "unknown"))];

  const filtered = requests.filter((row) => {
    if (params.status && row.status !== params.status) return false;
    if (params.provider && (row.provider ?? "unknown") !== params.provider) return false;
    return true;
  });

  const dailyMax = Math.max(...usage.daily.map((day) => day.requests), 1);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">AI usage</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Requests, tokens, latency and errors over the last 30 days. Fallback answers
            are the deterministic ones and cost nothing.
          </p>
        </div>
        {usage.totals.fallbackRate > 0 ? (
          <Badge tone="info">{usage.totals.fallbackRate}% served deterministically</Badge>
        ) : null}
      </header>

      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Requests" value={formatNumber(usage.totals.requests)} />
        <Stat label="Errors" value={formatNumber(usage.totals.errors)} tone={usage.totals.errors > 0 ? "danger" : "neutral"} />
        <Stat label="Fallback rate" value={`${usage.totals.fallbackRate}%`} />
        <Stat label="Prompt tokens" value={formatNumber(usage.totals.promptTokens)} />
        <Stat label="Completion tokens" value={formatNumber(usage.totals.completionTokens)} />
        <Stat
          label="Estimated cost"
          value={`${usage.totals.estimatedCost.toFixed(2)} EGP`}
        />
      </section>

      <section className="washi-panel p-4" aria-label="Daily request volume">
        <h2 className="font-display text-lg font-semibold text-ink-900">Daily volume</h2>
        {usage.daily.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700/70">
            No daily rollups yet. They appear once requests are recorded.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {usage.daily.map((day) => (
              <li key={`${day.day}-${day.provider}`} className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-800">
                    {day.day}
                    <span className="text-ink-700/65"> · {day.provider}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs tabular-nums text-ink-700/70">
                    <span>{formatNumber(day.requests)} req</span>
                    {day.errors > 0 ? (
                      <span className="text-chili-600">{day.errors} err</span>
                    ) : null}
                    <span>{formatNumber(day.prompt_tokens + day.completion_tokens)} tok</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-rice-200">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.max(1, (day.requests / dailyMax) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Request log">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink-900">Request log</h2>
          <nav aria-label="Filters" className="flex flex-wrap gap-2">
            <FilterLink
              href="/admin/ai/usage"
              label="All"
              active={!params.status && !params.provider}
            />
            {statuses.map((status) => (
              <FilterLink
                key={status}
                href={`/admin/ai/usage?status=${status}`}
                label={humanise(status)}
                active={params.status === status}
              />
            ))}
            {providers
              .filter((provider) => provider !== "unknown")
              .map((provider) => (
                <FilterLink
                  key={provider}
                  href={`/admin/ai/usage?provider=${encodeURIComponent(provider)}`}
                  label={provider}
                  active={params.provider === provider}
                />
              ))}
          </nav>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No requests match this filter"
            description={
              requests.length === 0
                ? "The assistant has not been used yet in this window."
                : "Clear the filter to see every recorded request."
            }
          />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[54rem] border-collapse text-sm">
              <caption className="sr-only">AI request log</caption>
              <thead>
                <tr className="border-b border-ink-900/12 text-left text-xs uppercase tracking-wide text-ink-700/70">
                  <th scope="col" className="py-2 pr-3 font-medium">When</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Surface</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Provider</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Model</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Latency</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Tokens</th>
                  <th scope="col" className="py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((row) => (
                  <tr key={row.id} className="border-b border-ink-900/6">
                    <td className="py-2 pr-3 text-ink-700/75">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="py-2 pr-3 text-ink-900">{humanise(row.surface)}</td>
                    <td className="py-2 pr-3 text-ink-800">{row.provider ?? "—"}</td>
                    <td className="py-2 pr-3 text-ink-700/80">{row.model ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <RunStatusBadge status={row.status} />
                      {row.error ? (
                        <span className="ml-2 text-xs text-chili-600" title={row.error}>
                          failed
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-700/80">
                      {row.latency_ms ? `${row.latency_ms} ms` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-700/80">
                      {(row.prompt_tokens ?? 0) + (row.completion_tokens ?? 0) || "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink-700/80">
                      {row.estimated_cost ? `${Number(row.estimated_cost).toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-ink-700/60">
        Token counts are provider-reported where available; the deterministic provider
        reports an estimate so relative volume is still visible.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="washi-panel p-3">
      <p className="text-xs text-ink-700/70">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-display text-xl font-semibold tabular-nums",
          tone === "danger" ? "text-chili-600" : "text-ink-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium",
        active
          ? "border-indigo-600 bg-indigo-600 text-rice-50"
          : "border-ink-900/12 bg-rice-50 text-ink-800 hover:bg-rice-200",
      )}
    >
      {label}
    </a>
  );
}
