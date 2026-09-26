/**
 * Asian-identity ambience: bamboo culms standing behind the hero and ink
 * panels. Pure CSS (repeating-linear-gradient internodes + bamboo-700 rings) —
 * no external image requests, no JS runtime cost, and hidden entirely when the
 * user prefers reduced motion (decorative only; the markup carries no text).
 *
 * The drifting leaves live in `LeafField2D` (Canvas2D), which is the only
 * falling-leaf effect on the site so the hero never stacks two of them.
 *
 * `locale` lets the bamboo lean toward the reading direction on wide screens;
 * the motif identity stays Asian either way. Positioned absolutely — place it
 * inside a `relative overflow-hidden` section.
 */
export function BambooAmbience({
  locale,
  density = "light",
}: {
  locale?: string;
  density?: "light" | "full";
}) {
  const rtl = locale === "ar";
  const culms = density === "full" ? 7 : 4;

  return (
    <div
      aria-hidden="true"
      data-motion="decorative"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-y-0 end-2 hidden w-24 sm:block"
        style={{ direction: rtl ? "rtl" : "ltr" }}
      >
        {Array.from({ length: culms }, (_, i) => {
          const h = 44 + ((i * 13) % 26);
          const delay = i * 0.7;
          return (
            <span
              key={i}
              className="absolute bottom-0 bamboo-culm"
              style={{
                left: `${4 + i * 24}%`,
                height: `${h}%`,
                animationDelay: `${delay}s`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
