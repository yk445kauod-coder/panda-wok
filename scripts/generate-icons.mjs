/**
 * Generates the browser-tab and home-screen icons from the canonical brand
 * mark, `public/panda-logo.svg`.
 *
 * Why this exists: the repo shipped Next's `create-next-app` placeholder
 * `src/app/favicon.ico` — the grey triangle — which is what browsers showed in
 * the tab. A binary .ico is opaque to review, so this script regenerates every
 * icon from the one vector source and the output is checked in. Re-run it with
 * `npm run icons` whenever the mark changes.
 *
 * Two things make a favicon legible at 16px, and the raw mark does neither:
 *
 *  - The logo is a near-square blob (95% of its bounding box is ink), so at
 *    small sizes it reads as a dark smudge. It is inset to ~78% of the canvas.
 *  - It is black-and-white. On the dark tab strip a black mark disappears, so
 *    every icon carries a rice-coloured plate behind it. That also gives the
 *    "any maskable" PWA icon the safe zone it needs.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, "public/panda-logo.svg");
const appDir = path.join(root, "src/app");
const publicDir = path.join(root, "public");

// Ink ground, matching --color-ink-900 in globals.css. The mark itself is a
// *white* panda on a transparent ground (it was drawn to sit on the dark hero),
// so it needs a dark plate to be visible at all — on a rice plate the white
// circle blends into the background. Kept literal rather than parsed from the
// stylesheet so the script has no CSS toolchain.
const INK = { r: 0x17, g: 0x13, b: 0x0f, alpha: 1 };
const PLATE = 0.78;

/**
 * The mark, centred on an opaque ink plate. `inset` is the fraction of the
 * canvas the mark fills.
 */
async function plate(size, inset) {
  const inner = Math.round(size * inset);
  const mark = await sharp(source, { density: Math.max(300, size * 4) })
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: INK,
    },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(appDir, { recursive: true });

  // icon.svg — SVG icons scale in the tab and in the taskbar without a raster
  // round trip. The plate is drawn in SVG so no bitmap is embedded.
  const svgMark = await sharp(source, { density: 1200 })
    .resize(300, 300, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" role="img" aria-label="Panda Wok">
  <rect width="512" height="512" rx="96" fill="#17130f"/>
  <image x="56" y="56" width="400" height="400" xlink:href="data:image/png;base64,${svgMark.toString("base64")}"/>
</svg>
`;
  await writeFile(path.join(appDir, "icon.svg"), svg);

  // apple-icon.png — iOS home screen. No transparency and no rounded corners;
  // iOS applies its own mask.
  await writeFile(path.join(appDir, "apple-icon.png"), await plate(180, 0.84));

  // favicon.ico — 16/32/48 are the sizes a browser tab actually asks for.
  // Hand-assembled because sharp cannot emit ICO; each entry is a PNG, which
  // every current browser accepts.
  const entries = [];
  for (const size of [16, 32, 48]) {
    const png = await plate(size, PLATE);
    entries.push({ size, png });
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = 6 + directory.length;
  entries.forEach((entry, index) => {
    const at = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1);
    directory.writeUInt8(0, at + 2); // palette size
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(entry.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });

  const ico = Buffer.concat([header, directory, ...entries.map((e) => e.png)]);
  await writeFile(path.join(appDir, "favicon.ico"), ico);

  // PWA / Android home screen. 192 and 512 are the sizes the manifest and
  // Android's install prompt require.
  await mkdir(publicDir, { recursive: true });
  await writeFile(path.join(publicDir, "icon-192.png"), await plate(192, 0.76));
  await writeFile(path.join(publicDir, "icon-512.png"), await plate(512, 0.76));

  console.log(
    [
      "icons written:",
      `  src/app/favicon.ico        ${ico.length} bytes (16/32/48)`,
      `  src/app/icon.svg           ${svg.length} bytes`,
      "  src/app/apple-icon.png     180x180",
      "  public/icon-192.png        192x192",
      "  public/icon-512.png        512x512",
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
