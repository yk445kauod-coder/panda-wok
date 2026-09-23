import { z } from "zod";
import {
  appError,
  toAppError,
  type AppError,
  type AppErrorCode,
} from "@/lib/utils/errors";

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
  return { ok: false, error: appError(code, { detail }) };
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Converts a Zod failure into a field map plus a summary message. The code is
 * VALIDATION, not UNKNOWN: the request was rejected locally before any server
 * call, so the UI must show field-level guidance rather than a retry prompt.
 */
export function toFormError(
  error: z.ZodError | undefined,
  fallbackFields?: Record<string, string>,
): FormActionResult<never> {
  return {
    ok: false,
    error: appError("VALIDATION"),
    fields: error
      ? { ...fieldErrors(error), ...fallbackFields }
      : fallbackFields,
  };
}
