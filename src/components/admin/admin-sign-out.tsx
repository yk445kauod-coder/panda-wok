"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { lockAdminAction } from "@/lib/actions/admin-gate";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils/format";

/**
 * Ends the console session for any staff member: revokes the gate cookie, ends
 * a session the console minted, then reloads so the gate reappears.
 *
 * A plain link would leave the minted Supabase token live — the gate cookie is
 * what opens `/admin`, but the token can still reach the API on its own. The
 * action clears both, so this is the one control a member presses when they
 * hand the device over or finish a shift.
 */
export function AdminSignOutButton({
  variant = "sidebar",
  onDone,
}: {
  /** `sidebar` for the dark drawer, `topbar` for the light desktop strip. */
  variant?: "sidebar" | "topbar";
  onDone?: () => void;
}) {
  const t = useT();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    onDone?.();
    try {
      await lockAdminAction();
    } catch {
      // `lockAdminAction` redirects, which the action client surfaces as a
      // navigation error; the cookies are already cleared, so a reload lands on
      // the gate either way.
    }
    window.location.href = "/admin";
  }

  const styles =
    variant === "topbar"
      ? "text-ink-700 hover:bg-ink-900/6 hover:text-ink-900"
      : "text-rice-200/75 hover:bg-rice-100/8 hover:text-rice-50";

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      title={t("admin.shell.signOutHint")}
      aria-busy={pending || undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors disabled:opacity-55",
        styles,
      )}
    >
      <LogOut className="size-3.5" aria-hidden="true" />
      {t("admin.shell.signOut")}
    </button>
  );
}
