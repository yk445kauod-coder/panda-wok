"use client";

import {
  GalleryHeading,
  GALLERY_HEADING_VARIANTS,
} from "@/shaders/neuform-isolated/NeuformIsolatedEffects";
import "@/shaders/threeui.css";

/**
 * The plate is authored to read "Prints from the flat files". The variant's
 * headline is the only thing we change: everything else about the Riso Sweep
 * gallery - the twelve flat plate colours, the riso field, the lit corner, the
 * scanlines, the heavy grain, the orbit and its hover ramp - is untouched.
 *
 * The component takes its headline from the exported variants table and offers
 * no prop for it, so the brand text is written there. That keeps the vendored
 * source byte-identical to the registered revision instead of forking it.
 *
 * The two ink widths are the authored ones rescaled by glyph count, so the
 * type keeps the letter density it was drawn with rather than being stretched
 * to an arbitrary measure.
 */
const sweep = GALLERY_HEADING_VARIANTS["horizontal-sweep"] as {
  title: string;
  headline: readonly string[];
  headlineWidths: readonly number[];
};

sweep.title = "Panda Wok";
sweep.headline = ["PANDA WOK", "ASIAN KITCHEN"];
sweep.headlineWidths = [1130, 1557];

/**
 * The hero's animated plate: ThreeUI's GalleryHeading in the Riso Sweep
 * variant.
 *
 * The effect renders a self-contained canvas document through a sandboxed
 * srcDoc iframe, so it cannot take part in the page's own layout or theme. It
 * is mounted as the hero's ground layer and the hero's copy sits on top.
 */
export function HeroGallery() {
  return (
    <GalleryHeading
      variant="horizontal-sweep"
      mode="dark"
      font="oldstyle"
      weight="700"
      headlineSize={1.2}
      hue={0}
      saturation={1}
      brightness={1}
    />
  );
}
