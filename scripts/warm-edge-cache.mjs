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

// Dish detail pages. `/menu/<slug>` is dynamic, so a deploy starts with none of
// them cached and every one is a cold render the first time a visitor opens it.
// The slugs come from the bootstrap payload the warm step already fetches, so
// this adds no extra origin read — it just walks the pages it already knows
// exist. Bounded so a runaway catalogue cannot turn the warm step into a
// traffic storm.
const DISH_WARM_LIMIT = 400;

const localised = (path, locale) => `/${locale}${path === "/" ? "" : path}`;
const ATTEMPTS = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every dish slug in the catalogue, read from the already-warmed bootstrap. */
async function dishSlugs(locale) {
  try {
    const res = await fetch(`${BASE}/api/public/bootstrap?locale=${locale}`, {
      headers: { "user-agent": "panda-wok-cache-warm" },
    });
    if (!res.ok) return [];
    const payload = await res.json();
    const menu = payload?.data?.menu ?? {};
    const slugs = new Set();
    for (const category of menu.categories ?? []) {
      for (const item of category.items ?? []) {
        if (item?.slug) slugs.add(item.slug);
      }
    }
    for (const item of menu.items ?? []) {
      if (item?.slug) slugs.add(item.slug);
    }
    return [...slugs].slice(0, DISH_WARM_LIMIT);
  } catch {
    return [];
  }
}

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
  // Dish detail pages, now that bootstrap is cached and can name them. A shorter
  // pause: each render is small and the cache now absorbs repeats.
  const slugs = await dishSlugs(locale);
  if (slugs.length > 0) {
    console.log(`  ${locale}: warming ${slugs.length} dish page(s)`);
    for (const slug of slugs) {
      const ok = await warm(`${locale} /menu/${slug}`, localised(`/menu/${slug}`, locale));
      if (!ok) failures += 1;
      await sleep(400);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} page(s) could not be warmed.`);
  process.exit(1);
}
console.log("\nEdge cache warmed.");
