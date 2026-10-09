"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, type Locale } from "@/lib/i18n/config";
import { setLocaleAction } from "@/lib/actions/locale";
import { cn } from "@/lib/utils/format";

/**
 * Language switcher. It writes the choice to a cookie through a server action
 * and lets the revalidation refresh the tree, so the whole page — including
 * server-rendered copy and `dir` — flips in one step without a full reload.
 */
export function LanguageSwitcher({
  current,
  variant = "compact",
}: {
  current: Locale;
  variant?: "compact" | "labelled";
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function choose(locale: Locale) {
    if (locale === current || pending) return;
    startTransition(async () => {
      await setLocaleAction(locale);
      // revalidatePath only clears the server cache; the client Router Cache
      // still holds the previous locale's payload, so the tree would keep
      // rendering the old language until a manual reload.
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center gap-1 rounded-full border border-ink-900/12 bg-rice-50/80 p-0.5"
    >
      {variant === "labelled" ? (
        <Languages className="ml-1.5 size-3.5 text-ink-700/60" aria-hidden="true" />
      ) : null}
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => choose(locale)}
            disabled={pending}
            aria-pressed={active}
            aria-label={LOCALE_LABELS[locale]}
            title={LOCALE_LABELS[locale]}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
              active
                ? "bg-vermilion-600 text-rice-50"
                : "text-ink-700 hover:bg-ink-900/5",
            )}
          >
            {variant === "labelled" ? LOCALE_LABELS[locale] : LOCALE_SHORT[locale]}
          </button>
        );
      })}
    </div>
  );
}
