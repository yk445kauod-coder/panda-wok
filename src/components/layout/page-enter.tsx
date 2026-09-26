"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Gentle entrance for route content via Framer Motion. The page fades in
 * and rises a few pixels; the effect is deliberate and quiet, never delayed,
 * and respects reduced-motion (which renders the content statically, no flash|
 * because the initial state matches the final state).
 */
export function PageEnter({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="page-sheet"
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}