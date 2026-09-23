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
  | "INVALID_TOTAL"
  | "VALIDATION"
  | "NOT_FOUND"
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
  INVALID_TOTAL:
    "The order total could not be calculated. Please review your basket and try again.",
  VALIDATION: "Some of the details are not valid. Please check and try again.",
  NOT_FOUND: "That record no longer exists.",
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

/** Every code the database may raise, as a word so it can be matched in text. */
const CODE_PATTERN = new RegExp(
  `\\b(${(
    [
      "AUTH_REQUIRED",
      "FORBIDDEN",
      "EMPTY_CART",
      "CART_TOO_LARGE",
      "ITEM_UNAVAILABLE",
      "ITEM_NOT_FOUND",
      "MIN_ORDER_NOT_MET",
      "ADDRESS_REQUIRED",
      "ADDRESS_INVALID",
      "ADDRESS_NOT_FOUND",
      "QUANTITY_LIMIT_EXCEEDED",
      "NO_LOYALTY_POINTS",
      "IDEMPOTENCY_KEY_REQUIRED",
      "ACCOUNT_BLOCKED",
      "INVALID_TOTAL",
      "VALIDATION",
      "NOT_FOUND",
      "OFFLINE",
      "RATE_LIMITED",
      "NOT_CONFIGURED",
      "UNKNOWN",
    ] as AppErrorCode[]
  ).join("|")})\\b`,
);

/**
 * Postgres SQLSTATE -> app code, for the raises that carry a bare message.
 * `42501` is insufficient_privilege; `22023` is invalid_parameter_value. Both
 * are raised with a code token in the message, so they are a last-resort hint
 * when the message itself does not name one.
 */
const SQLSTATE_HINTS: Record<string, AppErrorCode> = {
  "42501": "FORBIDDEN",
  "22023": "VALIDATION",
};

/** Business codes raised with a human sentence instead of a token. */
const PHRASE_HINTS: Array<[RegExp, AppErrorCode]> = [
  [/not authorised to (send broadcasts|export|create backups)/i, "FORBIDDEN"],
  [/a broadcast needs a (title|message)/i, "VALIDATION"],
  [/unknown dataset/i, "VALIDATION"],
];

/** Reads `message` off anything error-shaped, including PostgREST errors. */
function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string") return value;
  }
  return "";
}

/** Reads `code` (the SQLSTATE) off anything error-shaped. */
function rawCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const value = (error as { code?: unknown }).code;
    if (typeof value === "string") return value;
  }
  return undefined;
}

export function toAppError(error: unknown): AppError {
  const raw = rawMessage(error);

  const match = raw.match(CODE_PATTERN);
  if (match) {
    const code = match[1] as AppErrorCode;
    // Postgres emits `ITEM_UNAVAILABLE:Dish name`; keep the name for context.
    const detail = raw.includes(":")
      ? raw.slice(raw.indexOf(":") + 1).trim()
      : undefined;
    return { code, message: MESSAGES[code], detail: detail || undefined };
  }

  for (const [pattern, code] of PHRASE_HINTS) {
    if (pattern.test(raw)) return { code, message: MESSAGES[code] };
  }

  if (/fetch failed|network|Failed to fetch|ENOTFOUND|ETIMEDOUT/i.test(raw)) {
    return { code: "OFFLINE", message: MESSAGES.OFFLINE };
  }

  // A SQLSTATE with no recognisable message is still better than UNKNOWN: a
  // privilege failure is not a transient glitch the user should retry blindly.
  const sqlstate = rawCode(error);
  if (sqlstate && SQLSTATE_HINTS[sqlstate]) {
    const code = SQLSTATE_HINTS[sqlstate];
    return { code, message: MESSAGES[code] };
  }

  return { code: "UNKNOWN", message: MESSAGES.UNKNOWN };
}
