"use client";

import { Mascot } from "page-mascot";
import { useAssistant } from "@/components/panda/assistant-context";

/**
 * Panda mascot for the site header. Wrapped in a small client boundary
 * because page-mascot's Mascot uses hooks (useState/useEffect).
 *
 * Tapping the mascot keeps page-mascot's own poke reactions (boop) and also
 * opens the shared Panda assistant sheet: the click bubbles up from the button
 * after its internal handler ran, so both work without a fake hotspot.
 */
export function PandaMascot({ size = 42 }: { size?: number }) {
  const { openAssistant } = useAssistant();
  return (
    <div className="relative flex items-center" onClick={() => openAssistant()}>
      <Mascot
        directions="/mascots/panda-directions.webp"
        reactions="/mascots/panda-reactions.webp"
        size={size}
        label="Panda Wok mascot"
      />
    </div>
  );
}