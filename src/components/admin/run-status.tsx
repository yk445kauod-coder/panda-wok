import { Badge } from "@/components/ui/button";
import { humanise } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

/**
 * One vocabulary for the long-running job lifecycles (exports, backups,
 * broadcasts). queued → running → ready/sent, with failed/expired as the dead
 * ends and draft/canceled as the states that never ran. Keeping the mapping
 * here means the three pages never drift apart.
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
 * Async because the console resolves its locale per request; every caller is a
 * server component that already awaits.
 */
export async function RunStatusBadge({ status }: { status: string | null | undefined }) {
  const t = await getT(await getAdminLocale());
  const key = `admin.term.runStatus.${status ?? ""}`;
  const label = t(key);
  return <Badge tone={runStatusTone(status)}>{label === key ? humanise(status) : label}</Badge>;
}
