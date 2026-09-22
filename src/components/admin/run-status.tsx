import { Badge } from "@/components/ui/button";
import { humanise } from "@/lib/utils/format";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "plum";

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

export function RunStatusBadge({ status }: { status: string | null | undefined }) {
  return <Badge tone={runStatusTone(status)}>{humanise(status)}</Badge>;
}
