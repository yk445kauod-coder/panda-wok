"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Segment error boundary. Distinguishes a network/offline problem from a
 * server error so the customer knows whether retrying will help.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  useEffect(() => {
    // Surfaced in the browser console for debugging; no sensitive data included.
    console.error("Panda Wok page error", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <AlertTriangle className="size-10 text-miso-600" aria-hidden="true" />

      <h1 className="mt-4 font-display text-xl font-semibold text-ink-900">
        {offline ? "You appear to be offline" : "Something went wrong on our side"}
      </h1>
      <p className="mt-2 text-sm text-ink-700/85">
        {offline
          ? "Your basket is saved on this device. Reconnect and try again — nothing is lost."
          : "This is not your fault. Retrying usually fixes it. If it keeps happening, please contact the kitchen."}
      </p>

      <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
        <Button onClick={reset} className="sm:flex-1">
          <RotateCcw className="size-4" aria-hidden="true" />
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-ink-900/15 px-5 text-sm font-medium text-ink-900 hover:bg-rice-200 sm:flex-1"
        >
          Back home
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-4 text-[11px] text-ink-700/55">
          Reference: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
