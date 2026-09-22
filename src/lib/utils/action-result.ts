import { z } from "zod";
import { toAppError, type AppError, type AppErrorCode } from "@/lib/utils/errors";

/**
 * Uniform result for every server action. Client components branch on
 * `ok`, so no action ever throws across the network boundary and no raw
 * database error reaches the UI.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

export function actionOk(): ActionResult<undefined>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function actionFail(code: AppErrorCode, detail?: string): ActionResult<never> {
  return failure({ code, message: "", detail }, detail);
}

export function failure(error: Partial<AppError> & { code: AppErrorCode }, detail?: string): ActionResult<never> {
  const base = toAppError(error.code);
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message && error.message.length > 0 ? error.message : base.message,
      detail: detail ?? error.detail,
    },
  };
}

export function actionError(error: unknown): ActionResult<never> {
  return { ok: false, error: toAppError(error) };
}

/** Turns a Zod failure into a field-level error map the forms can render. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type FormActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: AppError; fields?: Record<string, string> };

export function formFailure(
  error: z.ZodError | AppError,
): FormActionResult<never> {
  if (error instanceof z.ZodError) {
    const generic = toAppError("Please check the highlighted fields.");
    return {
      ok: false,
      error: { ...generic, message: "Please check the highlighted fields." },
      fields: fieldErrors(error),
    };
  }
  return { ok: false, error };
}
