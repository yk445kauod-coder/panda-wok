"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Admin segment error boundary. /admin previously had none, so a failed query
 * on any ops screen surfaced as Next's default error page.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Panda Wok admin error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50dvh] max-w-lg flex-col items-center justify-center text-center">
      <AlertTriangle className="size-10 text-miso-600" aria-hidden="true" />

      <h1 className="mt-4 font-display text-xl font-semibold text-ink-900">
        This screen could not load
      </h1>
      <p className="mt-2 text-sm text-ink-700/85">
        The page failed while reading from the database. Nothing has been changed.
        Retry, and if it keeps failing check the Supabase project status.
      </p>

      <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
        <Button onClick={reset} className="sm:flex-1">
          <RotateCcw className="size-4" aria-hidden="true" />
          Try again
        </Button>
        <Link
          href="/admin"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-ink-900/15 px-5 text-sm font-medium text-ink-900 hover:bg-rice-100 sm:flex-1"
        >
          Back to overview
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-4 text-2xs text-ink-700/55">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
