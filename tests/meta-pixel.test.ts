import { describe, expect, it } from "vitest";
import { metaPixelId } from "@/lib/services/catalog";

/**
 * The pixel id is interpolated into a `<script>` string literal in the served
 * document, so the only thing standing between a bad settings value and broken
 * (or injected) JS is this guard. These cases pin the two properties that
 * matter: a malformed id is refused rather than emitted, and the kill switch
 * wins.
 */
describe("metaPixelId", () => {
  it("accepts a real numeric pixel id", () => {
    expect(metaPixelId(true, "1626139359047880")).toBe("1626139359047880");
  });

  it("trims surrounding whitespace", () => {
    expect(metaPixelId(true, "  1626139359047880  ")).toBe("1626139359047880");
  });

  it("returns null when tracking is switched off, even with a valid id", () => {
    expect(metaPixelId(false, "1626139359047880")).toBeNull();
  });

  it("returns null when the id is unset", () => {
    expect(metaPixelId(true, "")).toBeNull();
    expect(metaPixelId(true, undefined)).toBeNull();
  });

  it("refuses anything that is not a digits-only id", () => {
    // These are the shapes that would break out of, or corrupt, the script
    // string if they reached the page.
    expect(metaPixelId(true, "1626139359047880'; alert(1);//")).toBeNull();
    expect(metaPixelId(true, "1626139359047880\"")).toBeNull();
    expect(metaPixelId(true, "<script>")).toBeNull();
    expect(metaPixelId(true, "abc123")).toBeNull();
    expect(metaPixelId(true, "1626139359047880.0")).toBeNull();
  });

  it("refuses non-string values", () => {
    expect(metaPixelId(true, 1626139359047880)).toBeNull();
    expect(metaPixelId(true, null)).toBeNull();
    expect(metaPixelId(true, { id: "1" })).toBeNull();
  });
});
