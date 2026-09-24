"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  grantUnlock,
  passcodeMatches,
  revokeUnlock,
} from "@/lib/auth/admin-gate";
import { newRequestId, logAuthEvent } from "@/lib/auth/log";
import { appError, type AppError } from "@/lib/utils/errors";

export type GateResult = { ok: true } | { ok: false; error: AppError };

/**
 * Verifies the shared ops passcode and unlocks the console for this browser.
 * The submitted value is never logged or echoed; only the outcome and a
 * correlation id are recorded.
 */
export async function unlockAdminAction(
  formData: FormData,
): Promise<GateResult> {
  const requestId = newRequestId();
  const started = Date.now();
  const submitted = String(formData.get("passcode") ?? "");

  if (!submitted || !passcodeMatches(submitted)) {
    logAuthEvent({
      requestId,
      action: "admin_gate",
      outcome: "error",
      code: "FORBIDDEN",
      identifier: "admin-gate",
      durationMs: Date.now() - started,
    });
    return { ok: false, error: appError("FORBIDDEN", { requestId }) };
  }

  await grantUnlock();
  revalidatePath("/", "layout");

  logAuthEvent({
    requestId,
    action: "admin_gate",
    outcome: "ok",
    code: "GATE_ADMIN_UNLOCKED",
    durationMs: Date.now() - started,
  });

  return { ok: true };
}

/** Locks the console again for this browser. */
export async function lockAdminAction(): Promise<void> {
  await revokeUnlock();
  revalidatePath("/", "layout");
  redirect("/admin");
}
