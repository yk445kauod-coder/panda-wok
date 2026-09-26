"use client";

import type { ReactNode } from "react";
import "./page-enter.css";

/**
 * Entrance for route content — CSS-only so it costs zero JS. The fade/rise
 * is pure animation, respects prefers-reduced-motion, and never delays paint.
 */
export function PageEnter({ children }: { children: ReactNode }) {
  return <div className="page-enter page-sheet">{children}</div>;
}