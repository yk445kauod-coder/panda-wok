import { z } from "zod";
import { toAppError, type AppError, type AppErrorCode } from "@/lib/utils/errors";

/**
 * Uniform result for every server action. Client components branch on `ok`,
 * so no action ever throws across the network boundary and no raw database
 * error reaches the UI.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

export type FormActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: AppError; fields?: Record<string, string> };

export function actionOk(): ActionResult<undefined>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function actionError(error: unknown): FormActionResult<never> {
  return { ok: false, error: toAppError(error) };
}

export function actionFail(
  code: AppErrorCode,
  detail?: string,
): FormActionResult<never> {
  const base = toAppError(code);
  return { ok: false, error: { code, message: base.message, detail } };
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Converts a Zod failure into a field map plus a summary message. */
export function toFormError(
  error: z.ZodError | undefined,
  fallbackFields?: Record<string, string>,
): FormActionResult<never> {
  if (!error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "Please check the highlighted fields." },
      fields: fallbackFields,
    };
  }
  return {
    ok: false,
    error: { code: "UNKNOWN", message: "Please check the highlighted fields." },
    fields: { ...fieldErrors(error), ...fallbackFields },
  };
}
