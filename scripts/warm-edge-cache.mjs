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
// included because it is a public, un-personalised page there.
const PATHS = ["/", "/menu", "/about", "/contact", "/faq", "/location", "/privacy-policy", "/cart"];
const LOCALES = ["en", "ar"];
const ATTEMPTS = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isFailure = (res, body) =>
  res.status !== 200 || /exceeded resource limits|Error 1102/i.test(body);

async function warm(path, locale) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const started = Date.now();
    let res;
    let body = "";
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: { cookie: `panda-wok.locale=${locale}`, "user-agent": "panda-wok-cache-warm" },
        redirect: "manual",
      });
      body = await res.text();
    } catch (error) {
      console.warn(`  ${locale} ${path}: request failed (${error.message}), retrying`);
      await sleep(3000);
      continue;
    }
    const ms = Date.now() - started;
    if (isFailure(res, body)) {
      console.warn(`  ${locale} ${path}: ${res.status} after ${ms}ms, retry ${attempt}/${ATTEMPTS}`);
      await sleep(3000);
      continue;
    }
    console.log(`  ${locale} ${path}: ${res.status} in ${ms}ms`);
    return true;
  }
  console.error(`  ${locale} ${path}: still failing after ${ATTEMPTS} attempts`);
  return false;
}

let failures = 0;
for (const locale of LOCALES) {
  for (const path of PATHS) {
    const ok = await warm(path, locale);
    if (!ok) failures += 1;
    // A pause keeps each cold render from competing with the next one for the
    // same isolate's CPU budget.
    await sleep(1200);
  }
}

if (failures > 0) {
  console.error(`\n${failures} page(s) could not be warmed.`);
  process.exit(1);
}
console.log("\nEdge cache warmed.");
