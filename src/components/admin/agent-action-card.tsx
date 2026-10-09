"use client";

import { useState } from "react";
import { Check, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminForm } from "@/components/admin/form-kit";
import {
  applyAgentActionAction,
  decideAgentActionAction,
} from "@/lib/actions/agent";
import { cn, humanise } from "@/lib/utils/format";

type ActionRow = {
  id: string;
  kind: string;
  title: string;
  rationale: string | null;
  payload: Record<string, unknown>;
  status: string;
  applied_ref: string | null;
  error: string | null;
};

const STATUS_TONE: Record<string, string> = {
  proposed: "bg-miso-500/15 text-miso-700",
  approved: "bg-jade-600/15 text-jade-700",
  applied: "bg-jade-600/20 text-jade-700",
  rejected: "bg-ink-900/8 text-ink-700",
  failed: "bg-chili-500/15 text-chili-600",
};

/**
 * The approval queue. Every agent proposal lands here and nothing is applied
 * until a human has both approved it and pressed apply — two deliberate clicks,
 * because the effects (a broadcast, gifted points) reach real customers.
 */
export function AgentActionCard({ action }: { action: ActionRow }) {
  const [showPayload, setShowPayload] = useState(false);
  const decide = useAdminForm<undefined>(decideAgentActionAction);
  const apply = useAdminForm<{ ref: string }>(applyAgentActionAction);

  const isProposed = action.status === "proposed";
  const isApproved = action.status === "approved";

  return (
    <li className="rounded-xl border border-ink-900/10 bg-rice-100/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink-900">{action.title}</p>
          {action.rationale ? (
            <p className="mt-0.5 text-sm text-ink-700/80">{action.rationale}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-ink-900/8 px-2 py-0.5 text-[11px] font-medium text-ink-800">
            {humanise(action.kind)}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              STATUS_TONE[action.status] ?? "bg-ink-900/8 text-ink-700",
            )}
          >
            {humanise(action.status)}
          </span>
        </div>
      </div>

      {action.applied_ref ? (
        <p className="mt-1.5 text-xs text-ink-700/70">Reference: {action.applied_ref}</p>
      ) : null}
      {action.error ? (
        <p className="mt-1.5 text-xs text-chili-600">{action.error}</p>
      ) : null}

      <button
        type="button"
        onClick={() => setShowPayload((v) => !v)}
        className="mt-1.5 text-xs font-medium text-vermilion-700 underline underline-offset-2"
      >
        {showPayload ? "Hide details" : "What will be sent"}
      </button>
      {showPayload ? (
        <pre className="mt-1.5 max-h-40 overflow-auto rounded-lg bg-ink-900/5 p-2 text-[11px] leading-relaxed text-ink-800">
          {JSON.stringify(action.payload, null, 2)}
        </pre>
      ) : null}

      {isProposed ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <form
            onSubmit={decide.submit}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="actionId" value={action.id} />
            <input type="hidden" name="decision" value="approve" />
            <Button type="submit" size="sm" loading={decide.pending}>
              <Check className="size-3.5" aria-hidden="true" />
              Approve
            </Button>
          </form>
          <form onSubmit={decide.submit}>
            <input type="hidden" name="actionId" value={action.id} />
            <input type="hidden" name="decision" value="reject" />
            <Button type="submit" size="sm" variant="outline" loading={decide.pending}>
              <X className="size-3.5" aria-hidden="true" />
              Reject
            </Button>
          </form>
        </div>
      ) : null}

      {isApproved ? (
        <form onSubmit={apply.submit} className="mt-2.5">
          <input type="hidden" name="actionId" value={action.id} />
          <Button type="submit" size="sm" loading={apply.pending}>
            <Play className="size-3.5" aria-hidden="true" />
            Apply approved action
          </Button>
        </form>
      ) : null}

      {decide.error || apply.error ? (
        <p className="mt-1.5 text-xs text-chili-600">{decide.error ?? apply.error}</p>
      ) : null}
    </li>
  );
}
