"use client";

import { cn } from "@/lib/utils/format";

export type PandaState =
  | "idle"
  | "watching"
  | "blinking"
  | "curious"
  | "greeting"
  | "thinking"
  | "speaking"
  | "happy"
  | "surprised"
  | "recommending"
  | "order-added"
  | "goodbye";

type EyeShape = "open" | "half" | "closed" | "wide" | "happy";
type Mouth = "neutral" | "smile" | "open" | "small-o" | "wave";

/**
 * Panda mascot as a single inline SVG whose features are driven by state. It is
 * CSS-animated only, so it costs no image request and respects
 * prefers-reduced-motion through the .animate-sway utility.
 */
const EXPRESSIONS: Record<PandaState, { eyes: EyeShape; mouth: Mouth; tilt: number }> = {
  idle: { eyes: "open", mouth: "neutral", tilt: 0 },
  watching: { eyes: "open", mouth: "neutral", tilt: 2 },
  blinking: { eyes: "closed", mouth: "neutral", tilt: 0 },
  curious: { eyes: "wide", mouth: "small-o", tilt: -5 },
  greeting: { eyes: "happy", mouth: "smile", tilt: 0 },
  thinking: { eyes: "half", mouth: "small-o", tilt: 4 },
  speaking: { eyes: "open", mouth: "open", tilt: 0 },
  happy: { eyes: "happy", mouth: "smile", tilt: 0 },
  surprised: { eyes: "wide", mouth: "small-o", tilt: -2 },
  recommending: { eyes: "happy", mouth: "smile", tilt: 3 },
  "order-added": { eyes: "happy", mouth: "open", tilt: 0 },
  goodbye: { eyes: "half", mouth: "wave", tilt: -3 },
};

export function PandaMascot({
  state = "idle",
  className,
}: {
  state?: PandaState;
  className?: string;
}) {
  const expression = EXPRESSIONS[state] ?? EXPRESSIONS.idle;

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn(
        "transition-transform duration-500",
        state === "thinking" || state === "curious" ? "animate-sway" : null,
        className,
      )}
      style={{ transform: `rotate(${expression.tilt}deg)` }}
      role="img"
      aria-label={`Panda mascot, ${state.replace("-", " ")}`}
    >
      {/* ears */}
      <circle cx="16" cy="15" r="9.5" fill="#1b1815" />
      <circle cx="48" cy="15" r="9.5" fill="#1b1815" />
      <circle cx="16" cy="15" r="4.2" fill="#efe7d4" opacity="0.22" />
      <circle cx="48" cy="15" r="4.2" fill="#efe7d4" opacity="0.22" />

      {/* head */}
      <circle cx="32" cy="35" r="22" fill="#fdfbf5" stroke="#1b1815" strokeWidth="1.8" />

      {/* eye patches */}
      <ellipse cx="22.5" cy="31.5" rx="6.2" ry="7.2" fill="#1b1815" transform="rotate(-15 22.5 31.5)" />
      <ellipse cx="41.5" cy="31.5" rx="6.2" ry="7.2" fill="#1b1815" transform="rotate(15 41.5 31.5)" />

      <Eyes shape={expression.eyes} />

      {/* nose */}
      <ellipse cx="32" cy="41.5" rx="3.1" ry="2.2" fill="#1b1815" />
      <Mouth shape={expression.mouth} />

      {/* blush when pleased */}
      {expression.eyes === "happy" ? (
        <>
          <ellipse cx="18" cy="41" rx="3.4" ry="2" fill="#c4472f" opacity="0.28" />
          <ellipse cx="46" cy="41" rx="3.4" ry="2" fill="#c4472f" opacity="0.28" />
        </>
      ) : null}
    </svg>
  );
}

function Eyes({ shape }: { shape: EyeShape }) {
  const left = { x: 23.6, y: 30.6 };
  const right = { x: 40.4, y: 30.6 };

  if (shape === "closed" || shape === "half") {
    return (
      <>
        <path
          d={`M${left.x - 2.4} ${left.y} q2.4 ${shape === "closed" ? 2.2 : 1.4} 4.8 0`}
          stroke="#fdfbf5"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M${right.x - 2.4} ${right.y} q2.4 ${shape === "closed" ? 2.2 : 1.4} 4.8 0`}
          stroke="#fdfbf5"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }

  if (shape === "happy") {
    return (
      <>
        <path
          d={`M${left.x - 2.6} ${left.y + 1} q2.6 -3.4 5.2 0`}
          stroke="#fdfbf5"
          strokeWidth="1.7"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M${right.x - 2.6} ${left.y + 1} q2.6 -3.4 5.2 0`}
          stroke="#fdfbf5"
          strokeWidth="1.7"
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }

  const r = shape === "wide" ? 2.5 : 1.9;

  return (
    <>
      <circle cx={left.x} cy={left.y} r={r} fill="#fdfbf5" />
      <circle cx={right.x} cy={right.y} r={r} fill="#fdfbf5" />
      {shape === "wide" ? (
        <>
          <circle cx={left.x} cy={left.y} r="0.95" fill="#1b1815" />
          <circle cx={right.x} cy={right.y} r="0.95" fill="#1b1815" />
        </>
      ) : null}
    </>
  );
}

function Mouth({ shape }: { shape: Mouth }) {
  const y = 45.5;

  switch (shape) {
    case "smile":
      return (
        <path
          d={`M27.5 ${y} q4.5 4 9 0`}
          stroke="#1b1815"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      );
    case "open":
      return (
        <>
          <path
            d={`M27.5 ${y} q4.5 5.5 9 0 z`}
            fill="#1b1815"
          />
          <path
            d={`M29.5 ${y + 2} q2.5 2.4 5 0`}
            stroke="#c4472f"
            strokeWidth="1.1"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    case "small-o":
      return <circle cx="32" cy={y + 1} r="1.9" fill="#1b1815" />;
    case "wave":
      return (
        <path
          d={`M27.5 ${y + 0.5} q2.2 1.6 4.5 0.4 q2.3 -1.2 4.5 0.4`}
          stroke="#1b1815"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      );
    default:
      return (
        <path
          d={`M32 ${44} v2.2 M32 ${46.2} c-1.4 1.7 -3.3 1.7 -4.3 0.5 M32 ${46.2} c1.4 1.7 3.3 1.7 4.3 0.5`}
          stroke="#1b1815"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      );
  }
}
