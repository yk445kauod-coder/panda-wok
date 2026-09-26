import "server-only";

/**
 * Phone-first accounts have no real inbox. Supabase Auth still requires an
 * email-shaped identifier, so a deterministic address is derived from the
 * number at signup and recomputed at signin.
 *
 * The domain must be one with a *null MX* record (`0 .`), otherwise Supabase's
 * deliverability check rejects the address with `email_address_invalid` before
 * the account is created. That is exactly what the previous domain did:
 * `phone.pandawok.app` publishes no DNS records at all, so every phone-only
 * signup — the product's default path — failed with a generic error and no
 * account was ever created. `example.com` and friends resolve, but a domain
 * that actually accepts mail would risk the placeholder colliding with, or
 * leaking reset mail to, a real inbox. RFC 2606 reserves these names precisely
 * for this purpose, and `example.com` is the one reachable enough for the
 * validation to pass.
 *
 * Keep this in sync with the `email` column handling in `handle_new_user`;
 * the placeholder is stored on the profile so staff can recognise it.
 */
const PLACEHOLDER_DOMAIN = "example.com";

/** Last ten digits, so +20/0 prefixes and spacing variants map to one account. */
function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export function placeholderEmailFor(phone: string): string {
  return `panda-${phoneDigits(phone)}@${PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.endsWith(`@${PLACEHOLDER_DOMAIN}`));
}

/**
 * A customer may type either identifier into the single sign-in field. Matches
 * the same shape `signInSchema` accepts, so anything that reached the action has
 * already been classified once.
 */
export function looksLikePhone(identifier: string): boolean {
  return /^[+]?[\d\s()-]{8,}$/.test(identifier.trim());
}

/** Resolves the sign-in identifier to the email Supabase Auth knows about. */
export function emailForIdentifier(identifier: string): string {
  const value = identifier.trim();
  return looksLikePhone(value) ? placeholderEmailFor(value) : value;
}

/**
 * Chooses the address to authenticate with, given whatever the customer typed
 * and whatever email (if any) the matching profile stores.
 *
 * Kept pure and separate from the lookup so the branch that stranded returning
 * customers — signing in with a phone whose account has a real email — is
 * covered by a unit test rather than only by a live probe.
 */
export function pickSignInEmail(
  identifier: string,
  storedEmail: string | null | undefined,
): string {
  const value = identifier.trim();
  if (!looksLikePhone(value)) return value;

  // Compare against the placeholder this exact phone would derive, not merely
  // the placeholder domain: a customer is free to register a real address at
  // `example.com`, and treating that as derived would send them back to a
  // mailbox they cannot read.
  const stored = storedEmail?.trim();
  if (stored && stored !== placeholderEmailFor(value)) return stored;
  return placeholderEmailFor(value);
}
