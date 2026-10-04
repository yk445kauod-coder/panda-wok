import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils/format";

/**
 * Timestamps are rendered in the kitchen's timezone, not the runtime's.
 *
 * The Cloudflare Worker runs in UTC, so before this was pinned an order placed
 * at 15:40 in Alexandria displayed as "12:40" in the console — three hours
 * early, which made a live order look like it had been sitting for hours and
 * made the kitchen misjudge the queue. Every formatter that shows a clock has
 * to fix the zone explicitly; `Intl` otherwise takes the host's.
 */
describe("formatDateTime", () => {
  // 2026-10-04T12:40:38Z is 15:40 in Africa/Cairo (UTC+3, DST in October).
  const placedAt = "2026-10-04T12:40:38.252584+00:00";

  it("renders the kitchen's local time, not UTC", () => {
    expect(formatDateTime(placedAt)).toContain("03:40");
    expect(formatDateTime(placedAt)).not.toContain("12:40");
  });

  it("uses the 12-hour clock in English", () => {
    // 15:40 Cairo is "03:40 pm" — the convention the owner reads.
    expect(formatDateTime(placedAt)).toContain("pm");
    expect(formatDateTime(placedAt)).not.toContain("15:40");
  });

  it("uses the Arabic 12-hour convention (م) but still Cairo time", () => {
    // ar-EG shows 03:40 م — the same 15:40, in the convention Egyptian readers
    // expect. The point of the assertion is the *zone*, not the notation.
    expect(formatDateTime(placedAt, "ar")).toContain("03:40");
    expect(formatDateTime(placedAt, "ar")).toContain("م");
  });

  it("passes an invalid or missing value through as a dash", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not a date")).toBe("—");
  });
});

describe("formatDate", () => {
  it("uses the Cairo calendar day, which can differ from UTC near midnight", () => {
    // 2026-10-03T22:30Z is already 2026-10-04 01:30 in Cairo.
    expect(formatDate("2026-10-03T22:30:00Z")).toContain("04");
  });
});

describe("formatTime", () => {
  it("shows the local clock time in 12-hour form", () => {
    expect(formatTime("2026-10-04T12:40:38Z")).toBe("03:40 pm");
  });
});
