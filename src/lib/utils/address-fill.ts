/**
 * How a pin's reverse-geocoded address is merged into the address form.
 *
 * Kept as a pure function because this is the step that was silently broken: the
 * lookup resolved a street and district, then wrote them into inputs that were
 * not mounted yet, so the detected address was discarded and the customer had to
 * retype it. Pulling the decision out of the component means the "what does a
 * detected address do to the form" rule is testable without a DOM.
 */

export type ResolvedFields = {
  area: string;
  addressLine: string;
  city: string;
};

/** What the map found for a pin. Any part may be missing. */
export type ReverseGeocodeResult = {
  area: string | null;
  street: string | null;
  city: string | null;
};

/** Which fields the customer has typed in themselves. */
export type EditedFields = {
  area: boolean;
  addressLine: boolean;
  city: boolean;
};

/**
 * Merge a detected address into the current field values.
 *
 * A detected value fills a field the customer has not claimed; a field they have
 * typed into keeps their own wording, even if they move the pin afterwards. A
 * missing part of the lookup leaves the existing value alone rather than
 * blanking a field.
 */
export function mergeDetectedAddress(
  current: ResolvedFields,
  detected: ReverseGeocodeResult,
  edited: EditedFields,
): ResolvedFields {
  const next = { ...current };
  const fill = (key: keyof ResolvedFields, value: string | null) => {
    if (value && !edited[key]) next[key] = value;
  };
  fill("area", detected.area);
  fill("addressLine", detected.street);
  fill("city", detected.city);
  return next;
}

/** The single line shown beside the pin so the address can be eyeballed. */
export function formatDetectedAddress(detected: ReverseGeocodeResult): string {
  return [detected.street, detected.area, detected.city].filter(Boolean).join(" · ");
}
