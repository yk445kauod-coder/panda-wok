"use client";

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  RadialLinearScale,
  RadarController,
  Tooltip,
} from "chart.js";
import { MatrixController, MatrixElement } from "chartjs-chart-matrix";

/**
 * Chart.js registers its controllers/scales/elements explicitly so a bundler
 * can tree-shake the rest. Doing it once here — and importing this module from
 * every chart component — keeps registration idempotent instead of each chart
 * re-registering the same pieces.
 *
 * RadialLinearScale + RadarController are required by the radar; omitting them
 * fails at render with `"radialLinear" is not a registered scale`, which is the
 * kind of error that only shows up in the browser, never in tsc or the build.
 *
 * Deliberately NOT registered: the time scale (needs a date-adapter dependency
 * for no benefit here; our x-axis is short date labels).
 */
ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
  Legend,
  MatrixController,
  MatrixElement,
);

/**
 * Chart.js animates on the main thread by default. A user who has asked for
 * reduced motion should get the final frame immediately, so we turn animation
 * off only when that preference is set — otherwise Chart.js keeps its defaults.
 */
if (typeof window !== "undefined") {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const apply = () => {
    if (reduce.matches) {
      ChartJS.defaults.animation = false;
    }
  };
  apply();
  reduce.addEventListener?.("change", apply);
}

export { ChartJS };
