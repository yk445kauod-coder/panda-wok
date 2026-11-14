import { Badge } from "@/components/ui/button";
import { humanise } from "@/lib/utils/format";
import { useT } from "@/components/i18n-provider";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

/**
 * One vocabulary for the long-running job lifecycles (exports, backups).
 * queued → running → ready, with failed/expired as the dead ends and
 * draft/canceled as the states that never ran. Keeping the mapping here means
 * the pages never drift apart.
 */
const RUN_STATUS_TONES: Record<string, Tone> = {
  draft: "neutral",
  queued: "info",
  running: "info",
  sending: "info",
  ready: "success",
  sent: "success",
  failed: "danger",
  expired: "neutral",
  canceled: "neutral",
};

export function runStatusTone(status: string | null | undefined): Tone {
  return RUN_STATUS_TONES[status ?? ""] ?? "neutral";
}

/** Whether a job is still in flight, so the page can explain the wait. */
export function isRunInFlight(status: string | null | undefined): boolean {
  return status === "queued" || status === "running" || status === "sending";
}

/**
 * Client-side now that the console is an SPA: the locale comes from the
 * `I18nProvider` context rather than a per-request server lookup.
 */
export function RunStatusBadge({ status }: { status: string | null | undefined }) {
  const t = useT();
  const key = `admin.term.runStatus.${status ?? ""}`;
  const label = t(key);
  return <Badge tone={runStatusTone(status)}>{label === key ? humanise(status) : label}</Badge>;
}
