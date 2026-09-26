/**
 * Post-authentication redirect guard.
 *
 * A `next` value arrives from the query string, so it is attacker-controlled.
 * Only a same-origin relative path is accepted: protocol-relative values
 * (`//evil.example`) and absolute URLs are replaced with the fallback, which
 * would otherwise turn the sign-in flow into an open redirect.
 */
export function safeNext(next: string | undefined, fallback: string) {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  return next;
}
