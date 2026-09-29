import { describe, expect, it } from "vitest";
import {
  dishImageSrc,
  dishImageSrcSet,
  imagekitSrc,
} from "@/lib/images/responsive";

/**
 * The hero photo is an owner upload on ImageKit, and the previous helper only
 * rewrote Unsplash URLs — so a hero URL was served raw at full size (~285 KB)
 * on every page load. These pin the ImageKit path and, importantly, that the
 * Unsplash path and foreign hosts are untouched.
 */

// The real asset name contains a space, so the live URL is percent-encoded and
// the helper must not normalise it away.
const IMAGEKIT =
  "https://ik.imagekit.io/fpbwa3np7/80a4aa10-bc1b-11f1-8492-0b7b7a467f3b%20(1).png";
const UNSPLASH = "https://images.unsplash.com/photo-1234?ixid=abc";
const OTHER = "https://cdn.example.com/hero.jpg";

describe("imagekitSrc", () => {
  it("adds a width, quality and format transform", () => {
    const out = imagekitSrc(IMAGEKIT, 800);
    expect(out).toContain("tr=w-800%2Cq-70%2Cf-webp%2Cc-at_max");
  });

  it("keeps the percent-encoded asset path intact", () => {
    expect(imagekitSrc(IMAGEKIT, 800).startsWith(`${IMAGEKIT}?`)).toBe(true);
  });

  it("passes a non-ImageKit URL through untouched", () => {
    expect(imagekitSrc(UNSPLASH, 800)).toBe(UNSPLASH);
  });
});

describe("dishImageSrc", () => {
  it("routes ImageKit to the transform, not the Unsplash params", () => {
    const out = dishImageSrc(IMAGEKIT, 800);
    expect(out).toContain("tr=");
    expect(out).not.toContain("fm=webp&");
  });

  it("still rewrites Unsplash as before", () => {
    expect(dishImageSrc(UNSPLASH, 640)).toBe(
      "https://images.unsplash.com/photo-1234?w=640&q=70&fm=webp",
    );
  });

  it("passes an unknown host through untouched", () => {
    expect(dishImageSrc(OTHER, 800)).toBe(OTHER);
  });
});

describe("dishImageSrcSet", () => {
  it("emits one ImageKit candidate per width", () => {
    const out = dishImageSrcSet(IMAGEKIT);
    expect(out.split(", ")).toHaveLength(4);
    expect(out).toContain("400w");
    expect(out).toContain("1200w");
  });

  it("returns the bare URL for an unknown host rather than a broken srcSet", () => {
    expect(dishImageSrcSet(OTHER)).toBe(OTHER);
  });
});
