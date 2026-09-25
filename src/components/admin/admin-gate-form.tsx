"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/brand-logo";
import { unlockAdminAction } from "@/lib/actions/admin-gate";
import { useErrorText } from "@/components/i18n-provider";
import { toAppError, type AppError } from "@/lib/utils/errors";

/**
 * The single ops credential prompt. One field: the shared passcode opens the
 * console as the owner, a staff login id opens it with that member's role.
 * Nothing here reveals which credential a visitor holds or that the console
 * exists to anyone who does not already know the passcode.
 */
export function AdminGateForm({
  brand,
}: {
  brand?: { name: string; logo_url: string | null };
}) {
  const errorText = useErrorText();
  const [secret, setSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("secret", secret);
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
          className="mx-auto mt-5 grid size-11 place-items-center rounded-full bg-indigo-600/10 text-indigo-600"
        >
          <KeyRound className="size-5" />
        </div>
        <h1 className="mt-3 font-display text-lg font-semibold text-ink-900">
          Enter your access code
        </h1>
        <p className="mt-1 text-sm text-ink-700/80">
          Owners use the ops passcode. Team members use the id the owner issued
          them.
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-chili-500/30 bg-chili-500/8 p-3 text-sm text-chili-600">
            {errorText(error)}
          </p>
        ) : null}

        <label htmlFor="secret" className="sr-only">
          Access code
        </label>
        <input
          id="secret"
          name="secret"
          type="password"
          value={secret}
          autoComplete="off"
          autoFocus
          onChange={(event) => setSecret(event.target.value)}
          aria-invalid={error ? true : undefined}
          className="mt-4 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-center text-sm tracking-[0.3em] outline-none focus:border-miso-500"
        />

        <Button type="submit" size="lg" className="mt-4 w-full" loading={pending}>
          {pending ? "Checking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
