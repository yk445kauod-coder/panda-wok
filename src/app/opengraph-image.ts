import { getPublicSettings } from "@/lib/services/catalog";

export const revalidate = 3600;

/**
 * Generated PNG-compatible Open Graph image. Kept as a plain response rather
 * than next/og so it works without an extra font/edge dependency.
 */
export default async function opengraphImage(): Promise<Response> {
  const settings = await getPublicSettings();
  const brand = settings.brand.name;
  const tagline = settings.brand.tagline;
  const location = `${settings.brand.city}, ${settings.brand.country}`;

  // A calm rice-paper card with the brand set large; no external assets.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fdfbf5"/>
      <stop offset="100%" stop-color="#efe7d4"/>
    </linearGradient>
    <radialGradient id="glow" cx="18%" cy="12%" r="60%">
      <stop offset="0%" stop-color="#e8bf83" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#e8bf83" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="86%" cy="8%" r="55%">
      <stop offset="0%" stop-color="#b9c39a" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#b9c39a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#paper)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect width="1200" height="630" fill="url(#glow2)"/>
  <circle cx="1060" cy="520" r="150" fill="none" stroke="#8f3a4c" stroke-opacity="0.22" stroke-width="10"/>
  <circle cx="1060" cy="520" r="150" fill="none" stroke="#8f3a4c" stroke-opacity="0.35" stroke-width="10" stroke-dasharray="600 350" stroke-linecap="round"/>
  <text x="80" y="250" font-family="Georgia, 'Times New Roman', serif" font-size="96" font-weight="700" fill="#1b1815">${escapeXml(brand)}</text>
  <text x="80" y="320" font-family="Georgia, 'Times New Roman', serif" font-size="40" fill="#3a332c">${escapeXml(tagline)}</text>
  <rect x="80" y="370" width="120" height="4" rx="2" fill="#c8853c"/>
  <text x="80" y="440" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#3a332c">${escapeXml(location)}</text>
  <text x="80" y="490" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#a96a29">Wok · Ramen · Sushi · Izakaya</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
