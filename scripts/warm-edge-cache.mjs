/**
 * Warm the edge cache after a deploy.
 *
 * The origin runs on the Workers Free plan, whose 10 ms CPU ceiling is below the
 * cost of even a cold `/about` render — so a cold cache is what returns Error
 * 1102. `scripts/pages/edge-cache.js` keeps the cache durable, but a fresh
 * deployment starts empty, and a visitor who arrives before the first render has
 * landed would hit the ceiling. This walks every public page (both locales) once,
 * sequentially, retrying a cold start so the cache is populated before real
 * traffic reaches it.
 *
 * Usage:
 *   node scripts/warm-edge-cache.mjs [baseUrl]
 *   node scripts/warm-edge-cache.mjs https://panda-wok.pages.dev
 */

const BASE = (process.argv[2] ?? process.env.WARM_BASE_URL ?? "https://panda-wok.pages.dev").replace(/\/$/, "");

// Kept in sync with PUBLIC_PATHS in scripts/pages/edge-cache.js. `/cart` is
// included because it is a public, un-personalised page there. Paths are bare
// here and prefixed with the locale below, matching the prerendered URLs.
const PATHS = ["/", "/menu", "/about", "/contact", "/faq", "/location", "/privacy-policy", "/cart"];
const LOCALES = ["en", "ar"];

// The public JSON reads the static shells fetch after paint. They are cached by
// the same edge policy (see `CACHEABLE_API_PATHS`), so they must be warmed too —
// otherwise the first visitor after a deploy pays for the ~120 KB bootstrap D1
// read on the origin, which is exactly the cold-start cost the warm step exists
// to remove. The locale lives in the query string here.
const API_PATHS = ["/api/public/bootstrap", "/api/public/content"];

const localised = (path, locale) => `/${locale}${path === "/" ? "" : path}`;
const ATTEMPTS = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isFailure = (res, body) =>
  res.status !== 200 || /exceeded resource limits|Error 1102/i.test(body);

async function warm(label, url) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const started = Date.now();
    let res;
    let body = "";
    try {
      res = await fetch(`${BASE}${url}`, {
        headers: { "user-agent": "panda-wok-cache-warm" },
        redirect: "manual",
      });
      body = await res.text();
    } catch (error) {
      console.warn(`  ${label}: request failed (${error.message}), retrying`);
      await sleep(3000);
      continue;
    }
    const ms = Date.now() - started;
    if (isFailure(res, body)) {
      console.warn(`  ${label}: ${res.status} after ${ms}ms, retry ${attempt}/${ATTEMPTS}`);
      await sleep(3000);
      continue;
    }
    console.log(`  ${label}: ${res.status} in ${ms}ms`);
    return true;
  }
  console.error(`  ${label}: still failing after ${ATTEMPTS} attempts`);
  return false;
}

let failures = 0;
for (const locale of LOCALES) {
  for (const path of PATHS) {
    const ok = await warm(`${locale} ${path}`, localised(path, locale));
    if (!ok) failures += 1;
    // A pause keeps each cold render from competing with the next one for the
    // same isolate's CPU budget.
    await sleep(1200);
  }
  // The public JSON reads last, once the document renders have settled, so the
  // warm traffic itself does not compete with them.
  for (const path of API_PATHS) {
    const ok = await warm(`${locale} ${path}`, `${path}?locale=${locale}`);
    if (!ok) failures += 1;
    await sleep(600);
  }
  // Dish detail pages are NOT warmed here. `/menu/<slug>` ships as a static
  // `.html` file (`scripts/build-pages.mjs`), so a cold request is one `ASSETS`
  // read with no App Router render — it cannot exceed the CPU cap the way a
  // cold Next render did. The old walk hit all ~212 dish URLs sequentially and
  // took 20+ minutes, and a single slow cold start failed the whole step; it is
  // gone because the pages it protected no longer need it.
}

if (failures > 0) {
  console.error(`\n${failures} page(s) could not be warmed.`);
  process.exit(1);
}
console.log("\nEdge cache warmed.");
