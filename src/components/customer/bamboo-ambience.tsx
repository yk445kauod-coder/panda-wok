/**
 * Asian-identity ambience: bamboo culms standing behind the hero and a few
 * sakura/araliya leaves drifting down. Both are pure CSS/SVG — no external
 * image requests, no JS runtime cost, and both are hidden entirely when the
 * user prefers reduced motion (they are decorative only;markup has no text).
 *
 * The bamboo is drawn with repeating-linear-gradient segments that read as
 * culm internodes;ther rings are bamboo-700 bands. Leaves are tiny inline
 * SVG paths in three muted greens/plum, seeded with a stable pseudo-random
 * spread so they never look machined.
 while staying quiet (few, slow, translucent).
 *
 * `lang` lets the bamboo lean slightly toward the reading direction on wide
 * screens;the motif identity stays Asian either way. The component is
 * positioned absolutely;place it inside a `relative overflow-hidden` section.
 */
export function BambooAmbience({
  locale,
  density = "light",
  leaves = 0,
}: {
  locale?: string;
  density?: "light" | "full";
  leaves?: number;
}) {
  const rtl = locale === "ar";
  const culms = density === "full" ? 5 : 3;

  // Deterministic seed so SSR and client agree (no hydration mismatch).
  const seed = leaves > 0 ? Array.from({ length: leaves }, (_, i) => {
    const rnd = (n: number) => {
      const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    return {
      left: 6 + rnd(1) * 84,
      delay: rnd(2) * 12,
      duration: 11 + rnd(3) * 9,
      scale: 0.7 + rnd(4) * 0.7,
      tilt: rnd(5) * 40 - 20,
    };
  }) : [];

  return (
    <div
      aria-hidden="true"
      data-motion="decorative"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Bamboo culms along the far edge */}
      <div
        className="absolute inset-y-0 end-2 hidden w-16 sm:block"
        style={{ direction: rtl ? "rtl" : "ltr" }}
      >
        {Array.from({ length: culms }, (_, i) => {
          const h = 38 + ((i * 13) % 22);
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

      {/* Drifting leaves — only when asked (defaults to off on this render) */}
      {leaves > 0 ? (
        <div className="absolute inset-0">
          {seed.map((leaf, i) => (
            <span
              key={i}
              className="absolute top-0 bamboo-leaf"
              style={{
                left: `${leaf.left}%`,
                animationDelay: `${leaf.delay}s`,
                animationDuration: `${leaf.duration}s`,
                transform: `scale(${leaf.scale}) rotate(${leaf.tilt}deg)`,
              }}
            >
              <span className="bamboo-leaf-tumble">
                <LeafSvg tone={i % 3} face />
                <LeafSvg tone={i % 3} face={false} />
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LeafSvg({ tone, face = true }: { tone: number; face?: boolean }) {
  const hue = face ? ["#63734a", "#8f3a4c", "#4a8b76"][tone % 3] : ["#4c5938", "#732f3e", "#3a6f5e"][tone % 3];
  return (
    <svg viewBox="0 0 12 16" width="12" height="16" className={face ? "bamboo-leaf-face" : "bamboo-leaf-back"}>
      <path
        d="M1 1c3.5 1.5 6 4.5 7.5 9.5C.2 9 1 7.5 1 6.5 5.5 1 4 1 1 1Z"
        fill={hue}
        opacity={face ? "0.6" : "0.45"}
      />
    </svg>
  );
}