"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Unlock } from "lucide-react";
import { setAcceptingOrdersAction } from "@/lib/actions/ordering";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/format";

/**
 * The manual close/open lever — one physical-looking switch, front and centre.
 *
 * Distinct from the ordering-window editor: this is the "we are closed right
 * now" override, and it is a hard veto over the clock (see
 * `resolveStoreAvailability`). The lever flips immediately and shows its own
 * pending state, because the whole point is to use it mid-rush with the kitchen
 * watching.
 *
 * The switch is a native checkbox behind a styled track, so keyboard, screen
 * readers and RTL all behave without bespoke key handling.
 */
export function ManualCloseLever({ accepting }: { accepting: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  // Optimistic: the lever must feel physical, so it follows the tap and the
  // server result only ever corrects it back.
  const [state, setState] = useState(accepting);

  function flip(next: boolean) {
    setState(next);
    startTransition(async () => {
      const form = new FormData();
      form.set("accepting", next ? "true" : "false");
      const result = await setAcceptingOrdersAction(form);
      if (!result.ok) {
        setState(!next);
        // The admin is Arabic-first and `AppError.message` is English-only, so
        // the translated label is the better copy here.
        toastError(t("admin.closeLever.failed"));
        return;
      }
      success(next ? t("admin.closeLever.opened") : t("admin.closeLever.closed"));
      router.refresh();
    });
  }

  const closed = !state;

  return (
    <section
      aria-label={t("admin.closeLever.title")}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 transition-colors sm:p-5",
        closed
          ? "border-chili-500/40 bg-chili-500/8"
          : "border-jade-500/40 bg-jade-500/8",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-xl",
              closed ? "bg-chili-500/15 text-chili-600" : "bg-jade-500/15 text-jade-700",
            )}
          >
            {closed ? (
              <Lock className="size-6" aria-hidden="true" />
            ) : (
              <Unlock className="size-6" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-ink-900">
              {t("admin.closeLever.title")}
            </h2>
            <p className="mt-0.5 text-sm text-ink-700/80">
              {closed ? t("admin.closeLever.closedHint") : t("admin.closeLever.openHint")}
            </p>
          </div>
        </div>

        {/* The lever itself. */}
        <label className="flex cursor-pointer select-none items-center gap-3">
          <span className="text-sm font-semibold text-ink-900">
            {closed ? t("admin.closeLever.stateClosed") : t("admin.closeLever.stateOpen")}
          </span>
          <span className="relative inline-flex">
            <input
              type="checkbox"
              role="switch"
              checked={state}
              disabled={pending}
              onChange={(event) => flip(event.target.checked)}
              className="peer sr-only"
              aria-label={t("admin.closeLever.title")}
            />
            <span
              aria-hidden="true"
              className={cn(
                "relative h-9 w-[4.5rem] rounded-full border transition-colors",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-miso-500 peer-focus-visible:ring-offset-2",
                state ? "border-jade-600/40 bg-jade-500" : "border-chili-600/40 bg-chili-500",
                pending && "opacity-70",
              )}
            >
              {/* Knob travels with logical inset so it flips sides under RTL. */}
              <span
                className={cn(
                  "absolute top-1 grid size-7 place-items-center rounded-full bg-rice-50 text-ink-900 shadow-sm transition-all",
                  state ? "start-[2.25rem]" : "start-1",
                )}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <span className="text-[10px] font-bold" aria-hidden="true">
                    {state ? "ON" : "OFF"}
                  </span>
                )}
              </span>
            </span>
          </span>
        </label>
      </div>

      <p className="mt-3 text-xs text-ink-700/70">
        {closed ? t("admin.closeLever.noteClosed") : t("admin.closeLever.noteOpen")}
      </p>
    </section>
  );
}
