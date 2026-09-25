"use client";

import { useEffect, useRef } from "react";

type Leaf = {
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
  sway: number;
  color: string;
  tilt: number;
  spin: number;
};

const PALETTE = ["rgba(99,115,74,", "rgba(143,58,76,", "rgba(74,139,118,", "rgba(200,133,60,"];

/**
 * A light Canvas2D layer of drifting leaves for the hero. Deliberately uses
 * Canvas2D rather than WebGL: for a subtle decorative field this is the
 * professional choice (less GPU state, no bundle weight). Leaves are pre-baked
 * into filled sprites once, so each frame is a handful of `drawImage` calls;
 * devicePixelRatio is capped at 2, the loop pauses when the tab is hidden, and
 * reduced-motion renders a single still frame.
 */
export function LeafField2D({ count = 26 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const host = canvas;

    const pr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      host.width = Math.floor(w * pr);
      host.height = Math.floor(h * pr);
      ctx.setTransform(pr, 0, 0, pr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const rnd = (seed: number) => {
      const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    const leaves: Leaf[] = Array.from({ length: count }, (_, i) => ({
      x: rnd(i * 3 + 1) * 1.1 - 0.05,
      y: rnd(i * 3 + 2) * 1.2,
      size: 5 + rnd(i * 3 + 3) * 6,
      speed: 0.016 + rnd(i * 3 + 4) * 0.026,
      phase: rnd(i * 3 + 5) * 6.28,
      sway: 14 + rnd(i * 3 + 7) * 22,
      color: PALETTE[i % PALETTE.length],
      tilt: rnd(i * 3 + 8) * 6.28,
      spin: 0.4 + rnd(i * 3 + 9) * 1.2,
    }));

    // Bake one pointed leaf sprite per palette colour at 3x for crisp edges.
    const SUP = 3;
    const sprites = PALETTE.map((color) => {
      const size = 16 * SUP;
      const off = document.createElement("canvas");
      off.width = size * 2;
      off.height = size * 2;
      const s = off.getContext("2d");
      if (!s) return off;
      s.translate(size, size);
      s.fillStyle = color + "0.9)";
      s.beginPath();
      s.moveTo(0, -size * 0.5);
      s.quadraticCurveTo(size * 0.42, 0, 0, size * 0.5);
      s.quadraticCurveTo(-size * 0.42, 0, 0, -size * 0.5);
      s.fill();
      s.strokeStyle = "rgba(18,16,16,0.28)";
      s.lineWidth = Math.max(1, size * 0.035);
      s.beginPath();
      s.moveTo(0, -size * 0.44);
      s.lineTo(0, size * 0.44);
      s.stroke();
      return off;
    });

    let raf = 0;
    let hidden = document.hidden;
    const onVis = () => { hidden = document.hidden; };
    document.addEventListener("visibilitychange", onVis);

    // Pause the banner's drift once it scrolls out of view. `prog` is derived
    // from absolute time, so resuming continues from the right position.
    let visible = true;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { rootMargin: "80px" },
    );
    observer.observe(host);

    // ResizeObserver, not just `window.resize`: the canvas sits in a section
    // whose width can change without the window doing so.
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    canvas.dataset.leaffield = "ready";
    host.classList.add("has-canvas-leaves");

    const drawLeaf = (leaf: Leaf, prog: number, w: number, h: number, alpha: number) => {
      const x = leaf.x * w + (Math.sin(prog * 6.28 + leaf.phase * 3) * leaf.sway) / (1 + prog * 4);
      // A secondary sine adds a gentle non-linear drift to the fall.
      const y = (leaf.y + prog * 1.1) * h + Math.sin(prog * 12.56) * 6;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(leaf.tilt + prog * leaf.spin * 6.28);
      // Flutter: squeeze around the long axis so leaves appear to twist.
      const roll = 0.45 + 0.55 * Math.abs(Math.cos(prog * 6.28 + leaf.phase));
      ctx.scale(roll, 1);
      ctx.globalAlpha = alpha * 0.5;
      const sprite = sprites[PALETTE.indexOf(leaf.color)];
      const s = leaf.size;
      ctx.drawImage(sprite, -s, -s, s * 2, s * 2);
      ctx.restore();
    };

    const start = performance.now();
    const frame = (now: number) => {
      if (hidden || !visible) { raf = requestAnimationFrame(frame); return; }
      const t = (now - start) / 1000;
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      for (const leaf of leaves) {
        const prog = (t * leaf.speed + leaf.phase) % 1.35;
        drawLeaf(leaf, prog, w, h, 0.35 + 0.4 * Math.sin(prog * 3.14));
      }
      raf = requestAnimationFrame(frame);
    };

    if (reduced) {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      for (const leaf of leaves) drawLeaf(leaf, 0.55, w, h, 0.5);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-motion="decorative"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
