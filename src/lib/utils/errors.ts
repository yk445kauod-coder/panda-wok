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
  | "MODIFIER_LIMIT_EXCEEDED"
  | "NO_LOYALTY_POINTS"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "ACCOUNT_BLOCKED"
  | "INVALID_TOTAL"
  | "VALIDATION"
  | "NOT_FOUND"
  | "OFFLINE"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "EMAIL_ALREADY_EXISTS"
  | "PHONE_ALREADY_EXISTS"
  | "INVALID_CREDENTIALS"
  | "AUTH_PROVIDER_NOT_CONFIGURED"
  | "DATABASE_NOT_CONFIGURED"
  | "PROFILE_CREATE_FAILED"
  | "EMAIL_CONFIRMATION_REQUIRED"
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
  MODIFIER_LIMIT_EXCEEDED:
    "One or more extras are above the allowed maximum. Please review your choices.",
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
  EMAIL_ALREADY_EXISTS:
    "An account with this email already exists. Try signing in or reset your password.",
  PHONE_ALREADY_EXISTS:
    "An account with this phone number already exists. Try signing in or reset your password.",
  INVALID_CREDENTIALS:
    "That email, phone number or password combination did not work.",
  AUTH_PROVIDER_NOT_CONFIGURED:
    "Account creation is temporarily unavailable. Please try again shortly.",
  DATABASE_NOT_CONFIGURED:
    "Account creation is temporarily unavailable. Please try again shortly.",
  PROFILE_CREATE_FAILED:
    "We could not finish setting up your account. Please try again — nothing was saved.",
  EMAIL_CONFIRMATION_REQUIRED:
    "Check your inbox to confirm your email, then sign in.",
  UNKNOWN: "Something went wrong. Please try again.",
};

export type AppError = {
  code: AppErrorCode;
  message: string;
  /** Extra detail shown only when it is safe and useful (e.g. the dish name). */
  detail?: string;
  /** Support reference. Surfaced in the UI; safe to quote to the kitchen. */
  requestId?: string;
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
      "MODIFIER_LIMIT_EXCEEDED",
      "NO_LOYALTY_POINTS",
      "IDEMPOTENCY_KEY_REQUIRED",
      "ACCOUNT_BLOCKED",
      "INVALID_TOTAL",
      "VALIDATION",
      "NOT_FOUND",
      "OFFLINE",
      "RATE_LIMITED",
      "NOT_CONFIGURED",
      "EMAIL_ALREADY_EXISTS",
      "PHONE_ALREADY_EXISTS",
      "INVALID_CREDENTIALS",
      "AUTH_PROVIDER_NOT_CONFIGURED",
      "DATABASE_NOT_CONFIGURED",
      "PROFILE_CREATE_FAILED",
      "EMAIL_CONFIRMATION_REQUIRED",
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

  // A duplicate-key violation is a conflict on exactly one identity column, so
  // name the column rather than collapsing to the generic UNKNOWN. This matters
  // most for signup, where the phone/email index is what rejects the insert.
  if (rawCode(error) === "23505" || /duplicate key value violates unique constraint/i.test(raw)) {
    if (/profiles_phone_key|\(phone\)=/i.test(raw)) {
      return { code: "PHONE_ALREADY_EXISTS", message: MESSAGES.PHONE_ALREADY_EXISTS };
    }
    if (/profiles_email_key|\(email\)=/i.test(raw)) {
      return { code: "EMAIL_ALREADY_EXISTS", message: MESSAGES.EMAIL_ALREADY_EXISTS };
    }
    return { code: "VALIDATION", message: MESSAGES.VALIDATION };
  }

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

/**
 * Builds a structured AppError from a stable code. Used by the auth actions,
 * which classify provider and SQLSTATE failures themselves and attach a
 * correlation id so the exact server log line can be found from the UI.
 */
export function appError(
  code: AppErrorCode,
  extra?: { detail?: string; requestId?: string },
): AppError {
  return {
    code,
    message: MESSAGES[code],
    detail: extra?.detail,
    requestId: extra?.requestId,
  };
}

/** True when the value is a Postgres unique-violation (SQLSTATE 23505). */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    rawCode(error) === "23505" ||
    /duplicate key value violates unique constraint/i.test(rawMessage(error))
  );
}

/**
 * Picks the identity column a duplicate-key error names, when the error is a
 * unique violation. Returns null for any other failure so callers can fall back
 * to their own classification.
 */
export function duplicateKeyColumn(error: unknown): "phone" | "email" | null {
  if (!isDuplicateKeyError(error)) return null;
  const raw = rawMessage(error);
  if (/profiles_phone_key|\(phone\)=/i.test(raw)) return "phone";
  if (/profiles_email_key|\(email\)=/i.test(raw)) return "email";
  return null;
}

/**
 * Maps a Supabase Auth provider error to a stable app code. GoTrue returns a
 * machine `code` plus a human message; we match both so a provider upgrade that
 * renames a field does not silently regress to UNKNOWN.
 */
export function classifyAuthProviderError(error: unknown): AppErrorCode {
  const raw = rawMessage(error);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (
    /already registered|already exists|been registered|user_already_exists|email_exists/i.test(
      `${code} ${raw}`,
    ) ||
    isDuplicateKeyError(error)
  ) {
    if (/phone/i.test(`${code} ${raw}`) || duplicateKeyColumn(error) === "phone") {
      return "PHONE_ALREADY_EXISTS";
    }
    return "EMAIL_ALREADY_EXISTS";
  }

  if (/over_email_send_rate_limit|over_request_rate_limit|rate limit|too many/i.test(`${code} ${raw}`)) {
    return "RATE_LIMITED";
  }

  if (
    /email_address_invalid|email_address_not_authorized|email_provider_disabled|signup_disabled|provider.*not.*enabled/i.test(
      `${code} ${raw}`,
    )
  ) {
    return "AUTH_PROVIDER_NOT_CONFIGURED";
  }

  if (/database error|unexpected_failure|500/i.test(`${code} ${raw}`)) {
    return "PROFILE_CREATE_FAILED";
  }

  return "UNKNOWN";
}

