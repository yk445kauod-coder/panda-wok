"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

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
  const t = useT();

  useEffect(() => {
    console.error("Panda Wok admin error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50dvh] max-w-lg flex-col items-center justify-center text-center">
      <AlertTriangle className="size-10 text-miso-600" aria-hidden="true" />

      <h1 className="mt-4 font-display text-xl font-semibold text-ink-900">
        {t("admin.error.title")}
      </h1>
      <p className="mt-2 text-sm text-ink-700/85">{t("admin.error.body")}</p>

      <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
        <Button onClick={reset} className="sm:flex-1">
          <RotateCcw className="size-4" aria-hidden="true" />
          {t("admin.error.retry")}
        </Button>
        <Link
          href="/admin"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-ink-900/15 px-5 text-sm font-medium text-ink-900 hover:bg-rice-100 sm:flex-1"
        >
          {t("admin.error.backOverview")}
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-4 text-2xs text-ink-700/55">{t("admin.error.reference")}: {error.digest}</p>
      ) : null}
    </div>
  );
}
