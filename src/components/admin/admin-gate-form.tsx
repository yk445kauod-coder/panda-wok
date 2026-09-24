"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/brand-logo";
import { unlockAdminAction } from "@/lib/actions/admin-gate";
import { useErrorText } from "@/components/i18n-provider";
import { toAppError, type AppError } from "@/lib/utils/errors";

/**
 * Shared-passcode prompt shown ahead of the staff-role check on /admin. Kept
 * intentionally terse: anyone who does not already know the passcode — or that
 * the ops console exists — learns nothing from this screen.
 */
export function AdminGateForm({
  scope = "admin",
  brand,
}: {
  scope?: "admin" | "drops";
  brand?: { name: string; logo_url: string | null };
}) {
  const errorText = useErrorText();
  const [passcode, setPasscode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("passcode", passcode);
      formData.set("scope", scope);
      const result = await unlockAdminAction(formData);
      if (!result.ok) {
        setError(result.error);
        setPending(false);
        return;
      }
      // The unlock cookie is set; reload so the server re-renders the console
      // with the gate now passed.
      window.location.reload();
    } catch (caught) {
      setError(toAppError(caught));
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950 px-4">
      <form
        onSubmit={onSubmit}
        noValidate
        className="washi-panel w-full max-w-sm p-6 text-center"
      >
        <div className="mx-auto flex items-center justify-center gap-2 text-ink-900">
          <BrandLogo
            brand={brand ?? { name: "Panda Wok", logo_url: null }}
            className="size-8"
          />
          <span className="font-display text-lg font-semibold">Panda Wok Ops</span>
        </div>

        <div
          aria-hidden="true"
          className="mx-auto mt-5 grid size-11 place-items-center rounded-full bg-plum-600/10 text-plum-600"
        >
          <KeyRound className="size-5" />
        </div>
        <h1 className="mt-3 font-display text-lg font-semibold text-ink-900">
          Enter ops passcode
        </h1>
        <p className="mt-1 text-sm text-ink-700/80">
          This console is restricted. Ask the owner for the passcode.
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-chili-500/30 bg-chili-500/8 p-3 text-sm text-chili-600">
            {errorText(error)}
          </p>
        ) : null}

        <label htmlFor="passcode" className="sr-only">
          Ops passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          value={passcode}
          autoComplete="off"
          autoFocus
          onChange={(event) => setPasscode(event.target.value)}
          aria-invalid={error ? true : undefined}
          className="mt-4 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-center text-sm tracking-[0.3em] outline-none focus:border-miso-500"
        />

        <Button type="submit" size="lg" className="mt-4 w-full" loading={pending}>
          {pending ? "Checking…" : "Unlock"}
        </Button>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-700/60">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Staff sign-in is still required after unlocking.
        </p>
      </form>
    </div>
  );
}
