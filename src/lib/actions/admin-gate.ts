"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  grantUnlock,
  resolveSecret,
  revokeUnlock,
} from "@/lib/auth/admin-gate";
import { newRequestId, logAuthEvent } from "@/lib/auth/log";
import { appError, type AppError } from "@/lib/utils/errors";

export type GateResult = { ok: true } | { ok: false; error: AppError };

/**
 * Verifies the ops credential — the shared passcode (owner) or a staff
 * `login_id` — and unlocks the console for this browser. The submitted value is
 * never logged or echoed; only the outcome and a correlation id are recorded.
 */
export async function unlockAdminAction(
  formData: FormData,
): Promise<GateResult> {
  const requestId = newRequestId();
  const started = Date.now();
  const submitted = String(formData.get("secret") ?? formData.get("passcode") ?? "");

  const identity = await resolveSecret(submitted);
  if (!identity) {
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

  await grantUnlock(identity);
  revalidatePath("/", "layout");

  logAuthEvent({
    requestId,
    action: "admin_gate",
    outcome: "ok",
    code: identity.kind === "owner" ? "GATE_ADMIN_UNLOCKED" : "GATE_STAFF_UNLOCKED",
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
