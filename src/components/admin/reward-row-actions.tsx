"use client";

import Link from "next/link";
import { Pencil, Power, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/button";
import { AdminButtonAction } from "@/components/admin/form-kit";
import { useToast } from "@/components/ui/toast";
import { deleteRewardAction, toggleRewardAction } from "@/lib/actions/admin";
import { formatNumber, humanise } from "@/lib/utils/format";
import type { Database } from "@/lib/types/database";

type Reward = Database["public"]["Tables"]["loyalty_rewards"]["Row"];

/**
 * Row controls for a loyalty reward. The create form existed but nothing could
 * edit, disable or remove a reward once saved, so a mistyped cost stayed live
 * forever.
 */
export function RewardRowActions({ reward }: { reward: Reward }) {
  const toast = useToast();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/admin/loyalty?edit=${reward.id}#reward-form`}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-900/12 px-3 text-xs font-medium text-ink-800 hover:bg-rice-100"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit
      </Link>

      <AdminButtonAction
        action={async () => {
          const result = await toggleRewardAction(reward.id);
          if (result.ok) {
            toast.success(
              result.data.enabled ? "Reward enabled." : "Reward disabled.",
            );
          }
          return result;
        }}
        variant="outline"
      >
        <Power className="size-3.5" aria-hidden="true" />
        {reward.is_enabled ? "Disable" : "Enable"}
      </AdminButtonAction>

      <AdminButtonAction
        action={async () => {
          const result = await deleteRewardAction(reward.id);
          if (result.ok) toast.success("Reward deleted.");
          return result;
        }}
        variant="outline"
        confirm={`Delete "${reward.name_en}"?`}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Delete
      </AdminButtonAction>

      <Badge tone={reward.is_enabled ? "success" : "neutral"}>
        {reward.is_enabled ? "Live" : "Hidden"}
      </Badge>
      <Badge tone="plum">{formatNumber(reward.points_cost)} pts</Badge>
      <Badge tone="info">{humanise(reward.kind)}</Badge>
    </div>
  );
}
