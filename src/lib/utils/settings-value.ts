/**
 * One parser for every stored setting value, so two readers cannot disagree.
 *
 * The `settings` table keeps each value as JSON text, but it also carries older
 * and hand-written rows. The manual close lever exposed the gap: the value
 * `"0.0"` was read as **on** by the storefront (`!== false`) and as **off** by
 * the order gate (`Boolean(0)`), so the console could show "open" while the
 * kitchen refused every order. Reading through one function makes both sides
 * agree, and treats anything ambiguous as the caller's fallback rather than
 * silently defaulting to "on".
 */
export function settingBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().replace(/^"|"$/g, "").toLowerCase();
  if (text === "true" || text === "t") return true;
  if (text === "false" || text === "f") return false;
  if (text === "") return fallback;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric !== 0;
  return fallback;
}
