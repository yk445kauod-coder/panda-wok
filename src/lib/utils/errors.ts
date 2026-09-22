/**
 * Normalises any thrown value into a message that is safe to show a user.
 * Business rule violations raised by the database (ITEM_UNAVAILABLE, …) are
 * mapped to friendly copy; anything unrecognised becomes a generic message so
 * internal details and stack traces never leak into the UI.
 */
export type AppErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "EMPTY_CART"
  | "CART_TOO_LARGE"
  | "ITEM_UNAVAILABLE"
  | "ITEM_NOT_FOUND"
  | "MIN_ORDER_NOT_MET"
  | "ADDRESS_REQUIRED"
  | "ADDRESS_INVALID"
  | "ADDRESS_NOT_FOUND"
  | "QUANTITY_LIMIT_EXCEEDED"
  | "NO_LOYALTY_POINTS"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "ACCOUNT_BLOCKED"
  | "OFFLINE"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

const MESSAGES: Record<AppErrorCode, string> = {
  AUTH_REQUIRED: "Please sign in to continue.",
  FORBIDDEN: "You do not have permission to do that.",
  EMPTY_CART: "Your basket is empty.",
  CART_TOO_LARGE: "That is too many lines for one order. Please split it.",
  ITEM_UNAVAILABLE: "An item in your basket just became unavailable.",
  ITEM_NOT_FOUND: "An item in your basket no longer exists on the menu.",
  MIN_ORDER_NOT_MET: "Your basket is below the minimum order value.",
  ADDRESS_REQUIRED: "Please choose a delivery address.",
  ADDRESS_INVALID: "That delivery address is missing a street or building.",
  ADDRESS_NOT_FOUND: "We could not find that delivery address.",
  QUANTITY_LIMIT_EXCEEDED: "That quantity is above the per-item limit.",
  NO_LOYALTY_POINTS: "You do not have enough points to redeem.",
  IDEMPOTENCY_KEY_REQUIRED:
    "Something went wrong submitting the order. Please retry.",
  ACCOUNT_BLOCKED:
    "This account cannot place orders. Please contact the kitchen.",
  OFFLINE: "You appear to be offline. Your basket is saved on this device.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  NOT_CONFIGURED: "This feature is not configured yet.",
  UNKNOWN: "Something went wrong. Please try again.",
};

export type AppError = {
  code: AppErrorCode;
  message: string;
  /** Extra detail shown only when it is safe and useful (e.g. the dish name). */
  detail?: string;
};

export function toAppError(error: unknown): AppError {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const match = raw.match(
    /\b(AUTH_REQUIRED|FORBIDDEN|EMPTY_CART|CART_TOO_LARGE|ITEM_UNAVAILABLE|ITEM_NOT_FOUND|MIN_ORDER_NOT_MET|ADDRESS_REQUIRED|ADDRESS_INVALID|ADDRESS_NOT_FOUND|QUANTITY_LIMIT_EXCEEDED|NO_LOYALTY_POINTS|IDEMPOTENCY_KEY_REQUIRED|ACCOUNT_BLOCKED)\b/,
  );

  if (match) {
    const code = match[1] as AppErrorCode;
    // Postgres emits `ITEM_UNAVAILABLE:Dish name`; keep the name for context.
    const detail = raw.includes(":")
      ? raw.slice(raw.indexOf(":") + 1).trim()
      : undefined;
    return { code, message: MESSAGES[code], detail: detail || undefined };
  }

  if (/fetch failed|network|Failed to fetch|ENOTFOUND|ETIMEDOUT/i.test(raw)) {
    return { code: "OFFLINE", message: MESSAGES.OFFLINE };
  }

  return { code: "UNKNOWN", message: MESSAGES.UNKNOWN };
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}

export function messageForCode(code: AppErrorCode, detail?: string) {
  const base = MESSAGES[code];
  return detail ? `${base} (${detail})` : base;
}
