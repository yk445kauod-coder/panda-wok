"use client";

import { useEffect, useRef } from "react";

type Petal = {
  x: number;
  y: number;
  size: number;
  fall: number;
  spin: number;
  spinRate: number;
  rollBase: number;
  rollAmp: number;
  rollFreq: number;
  phase: number;
  slip: number;
  sprite: number;
};

/**
 * Falling sakura petals.
 *
 * Ports the look of the Sakura.js plugin (MIT, jhammann/sakura) into the
 * Canvas2D renderer already used here: the same petal gradient
 * (rgba(255,183,197,.9) -> rgba(255,197,208,.9)), the same 10-14px petal size
 * band, and the same three-part motion — a linear fall that fades out, a slow
 * lateral blow, and a swaying rotation.
 *
 * Sakura.js appends one `<div>` plus three CSS animations per petal, so a full
 * field is dozens of composited layers; baking the petals once and drawing them
 * with `drawImage` reproduces the motion for a fraction of the paint cost.
 *
 * The tumble is what makes it read as a petal instead of confetti: each petal
 * turns about its own long axis, thinning to an edge and opening out on its
 * back face. Its sideways slip is driven by that same angle, so it knifes
 * sideways when edge-on and stalls when it lies flat.
 */

/**
 * Front/back gradient stops. The first pair is Sakura.js's own default; the
 * rest add depth so a field is not one flat pink, and the palest doubles as the
 * distant layer.
 */
const PALETTE: { deep: string; pale: string }[] = [
  { deep: "255,183,197", pale: "255,197,208" },
  { deep: "255,169,192", pale: "255,205,217" },
  { deep: "248,160,184", pale: "255,214,224" },
  { deep: "255,197,208", pale: "255,226,233" },
];

const SUPERSAMPLE = 3;
const HALF = 16 * SUPERSAMPLE;

/** One petal sprite, pre-baked so each frame is a single drawImage call. */
function bakePetal(deep: string, pale: string, back: boolean) {
  const off = document.createElement("canvas");
  off.width = HALF * 2;
  off.height = HALF * 2;
  const ctx = off.getContext("2d");
  if (!ctx) return off;
  ctx.translate(HALF, HALF);

  const gradient = ctx.createLinearGradient(0, HALF * 0.62, 0, -HALF * 0.62);
  gradient.addColorStop(0, `rgba(${deep},${back ? 0.62 : 0.95})`);
  gradient.addColorStop(1, `rgba(${pale},${back ? 0.5 : 0.82})`);
  ctx.fillStyle = gradient;

  // A sakura petal is a rounded body that dips to a small notch at the tip.
  // Without the notch the silhouette is just a blob and reads as confetti.
  ctx.beginPath();
  ctx.moveTo(0, HALF * 0.62);
  ctx.bezierCurveTo(-HALF * 0.62, HALF * 0.3, -HALF * 0.66, -HALF * 0.3, -HALF * 0.34, -HALF * 0.6);
  ctx.quadraticCurveTo(0, -HALF * 0.34, HALF * 0.34, -HALF * 0.6);
  ctx.bezierCurveTo(HALF * 0.66, -HALF * 0.3, HALF * 0.62, HALF * 0.3, 0, HALF * 0.62);
  ctx.closePath();
  ctx.fill();

  if (!back) {
    ctx.strokeStyle = "rgba(214,120,150,0.22)";
    ctx.lineWidth = Math.max(1, HALF * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, HALF * 0.5);
    ctx.quadraticCurveTo(HALF * 0.06, 0, 0, -HALF * 0.4);
    ctx.stroke();
  }
  return off;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export function SakuraField({ density = 1 }: { density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;

    const resize = () => {
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(width * pr);
      canvas.height = Math.floor(height * pr);
      ctx.setTransform(pr, 0, 0, pr, 0, 0);
    };
    resize();

    const front = PALETTE.map((c) => bakePetal(c.deep, c.pale, false));
    const back = PALETTE.map((c) => bakePetal(c.deep, c.pale, true));

    // Density is derived from the section's own area, so a short hero does not
    // get the same petal count as a full-height one.
    const petalCount = () =>
      Math.max(12, Math.min(48, Math.round((width * height) / 24000) * density));

    const spawn = (seedY: boolean): Petal => {
      const sprite = Math.floor(Math.random() * PALETTE.length);
      // Depth: the palest sprites sit furthest away and move slowest.
      const depth = sprite / (PALETTE.length - 1);
      const size = rand(9, 15) * (0.72 + depth * 0.4);
      return {
        x: rand(-40, width + 40),
        y: seedY ? rand(-height, height) : rand(-height * 0.3, -size),
        size,
        fall: rand(52, 118) * (0.7 + depth * 0.5),
        spin: rand(0, Math.PI * 2),
        spinRate: rand(0.5, 1.5) * (Math.random() < 0.5 ? -1 : 1),
        rollBase: rand(-0.6, 0.6),
        rollAmp: rand(0.25, 0.95),
        rollFreq: rand(0.35, 0.8),
        phase: rand(0, Math.PI * 2),
        slip: rand(9, 27),
        sprite,
      };
    };

    let petals: Petal[] = [];
    const fill = () => {
      const target = petalCount();
      petals = Array.from({ length: target }, () => spawn(true));
      for (const petal of petals) {
        if (petal.y > height) petal.y = rand(-height * 0.2, height);
      }
    };
    fill();

    const onResize = () => {
      resize();
      fill();
    };
    window.addEventListener("resize", onResize);

    let hidden = document.hidden;
    const onVisibility = () => {
      hidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    canvas.dataset.sakuraField = "ready";

    const draw = (petal: Petal, elapsed: number) => {
      const s = petal.size;
      const cos = Math.cos(petal.spin);
      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.rollBase + Math.sin(elapsed * petal.rollFreq + petal.phase) * petal.rollAmp);
      ctx.scale(cos, 1);
      // Fades as it descends, the way Sakura.js runs opacity 0.9 -> 0.2.
      const progress = Math.max(0, Math.min(1, petal.y / height));
      ctx.globalAlpha = 0.92 - progress * 0.7;
      ctx.drawImage(cos < 0 ? back[petal.sprite] : front[petal.sprite], -s, -s, s * 2, s * 2);
      ctx.restore();
    };

    if (reduced) {
      for (const petal of petals) draw(petal, 0);
      return () => {
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (hidden) {
        raf = requestAnimationFrame(frame);
        return;
      }
      elapsed += dt;
      ctx.clearRect(0, 0, width, height);

      for (const petal of petals) {
        petal.spin += petal.spinRate * dt;
        // Slip is coupled to the tumble, so the petal knifes sideways exactly
        // when it is edge-on rather than drifting on an unrelated sine.
        petal.x += Math.sin(petal.spin) * petal.slip * dt;
        petal.y += petal.fall * dt;

        if (petal.y - petal.size > height) {
          Object.assign(petal, spawn(false));
          continue;
        }
        if (petal.x < -60) petal.x = width + 40;
        else if (petal.x > width + 60) petal.x = -40;

        draw(petal, elapsed);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-motion="decorative"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
