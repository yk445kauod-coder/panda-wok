"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { cancelOrderAction } from "@/lib/actions/checkout";

/**
 * Cancel, with a confirmation step. Cancellation is only offered while the
 * kitchen has not started cooking, and the server re-checks that rule so a
 * stale page cannot cancel an order that has already progressed.
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setPending(true);
    setError(null);
    const result = await cancelOrderAction(orderId);
    if (!result.ok) {
      setError(result.error.message);
      setPending(false);
      return;
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-11 sm:flex-1"
        onClick={() => setConfirming(true)}
      >
        <XCircle className="size-4" aria-hidden="true" />
        {t("orders.cancelOrder")}
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-chili-500/30 bg-chili-500/8 p-3.5 sm:flex-1">
      <p className="flex items-start gap-2 text-sm font-medium text-chili-600">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("orders.cancelConfirmTitle")}
      </p>
      <p className="mt-1 text-xs text-ink-700/85">{t("orders.cancelConfirmBody")}</p>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-chili-600">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="danger"
          size="sm"
          loading={pending}
          onClick={() => void cancel()}
        >
          {t("orders.cancelYes")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          {t("orders.cancelKeep")}
        </Button>
      </div>
    </div>
  );
}
