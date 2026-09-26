/**
 * Renders structured data as a script tag. The payload is JSON-serialised with
 * `<` escaped so an innocent-looking dish name cannot close the tag early.
 */
export function JsonLdScript({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      // JSON-LD cannot be expressed as JSX.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
