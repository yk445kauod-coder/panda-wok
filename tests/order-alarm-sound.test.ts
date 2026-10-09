import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The console has an order alarm; the customer site must stay silent. Both are
 * standing rules, and neither is visible to `tsc` or lint:
 *
 *  1. The site is silent by design (see AGENTS.md) — the sound module must never
 *     be imported anywhere under the customer surface. A single import would put
 *     an order siren in front of a diner.
 *  2. The kitchen asked for the alarm *loud* and for it to keep ringing until
 *     somebody acts. This pins that the siren rides a boosted bus (not the shared
 *     unity-gain master), so a future tidy-up cannot quietly turn it back into a
 *     polite beep.
 */

const TING = readFileSync("src/lib/sound/ting.ts", "utf8");

function sourceFilesUnder(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFilesUnder(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("order alarm loudness and silence of the customer site", () => {
  it("is never imported under the customer surface", () => {
    const offenders = sourceFilesUnder("src/app").filter(
      (file) => file.includes("(site)") && readFileSync(file, "utf8").includes("lib/sound/ting"),
    );
    expect(offenders).toEqual([]);
  });

  it("imports nothing under (site) that creates audio", () => {
    const offenders = sourceFilesUnder("src/app").filter(
      (file) =>
        file.includes("(site)") &&
        /AudioContext|new Audio\(|webkitAudioContext/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("drives the siren through a bus boosted above unity gain", () => {
    // A dedicated alarm bus, boosted, feeding the shared master/limiter.
    expect(TING).toMatch(/ALARM_GAIN\s*=\s*[2-9]/);
    expect(TING).toMatch(/function getAlarmBus\(/);
    expect(TING).toMatch(/gain\.value\s*=\s*ALARM_GAIN/);
  });

  it("routes siren strikes through the boosted bus, not the master directly", () => {
    const strike = TING.slice(TING.indexOf("function sirenStrike"), TING.indexOf("function playSirenBurst"));
    expect(strike).toMatch(/getAlarmBus\(ctx\)/);
    expect(strike).not.toMatch(/getMaster\(ctx\)/);
  });

  it("adds high-frequency energy so it cuts through kitchen noise", () => {
    const strike = TING.slice(TING.indexOf("function sirenStrike"), TING.indexOf("function playSirenBurst"));
    // The fundamental, an octave, and a two-octave "edge" layer.
    expect(strike).toMatch(/frequency\.value\s*=\s*frequency/);
    expect(strike).toMatch(/frequency\.value\s*=\s*frequency\s*\*\s*2/);
    expect(strike).toMatch(/frequency\.value\s*=\s*frequency\s*\*\s*4/);
  });
});
