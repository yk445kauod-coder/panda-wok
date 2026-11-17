import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { isCacheablePath } from "./pages/edge-cache.js";

/**
 * Assembles the Cloudflare Pages deployment directory.
 *
 * Pages runs an `_worker.js` in "advanced mode" and, unlike Workers, does not
 * serve the sidecar assets directory for us. The wrapper below fronts the
 * OpenNext worker and resolves static files from the `ASSETS` binding first, so
 * `/_next/static/*` and public files are not swallowed by the Next handler.
 */
const root = process.cwd();
const OPEN_NEXT = path.join(root, ".open-next");
const OUT = path.join(root, ".pages");

async function main() {
  if (!existsSync(path.join(OPEN_NEXT, "worker.js"))) {
    console.log("No .open-next/worker.js — building first.");
    execFileSync("npx", ["opennextjs-cloudflare", "build"], {
      stdio: "inherit",
      cwd: root,
    });
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  await cp(path.join(OPEN_NEXT, "assets"), OUT, { recursive: true });
  for (const dir of ["cloudflare", "middleware", "server-functions", ".build"]) {
    const from = path.join(OPEN_NEXT, dir);
    if (existsSync(from)) await cp(from, path.join(OUT, dir), { recursive: true });
  }
  await cp(path.join(OPEN_NEXT, "worker.js"), path.join(OUT, "opennext-worker.js"));

  // The pages this build prerendered live in `.open-next/cache`. Ship them with
  // the deployment under the path the static-assets incremental cache reads
  // (`cdn-cgi/_next_cache`), so a cold KV — a fresh deploy, or a day the KV
  // write quota is spent — still serves them instead of re-rendering every page
  // and exceeding the Worker CPU limit. This is a plain copy: it costs no KV
  // writes, unlike `populateCache`, and it is what makes the site survive a
  // deploy that cannot populate KV.
  await cp(path.join(OPEN_NEXT, "cache"), path.join(OUT, "cdn-cgi", "_next_cache"), {
    recursive: true,
  });

  // Ship each prerendered public shell as a plain `.html` file beside the cache.
  //
  // The public pages are constant per locale, but OpenNext serves them by
  // reading and JSON-parsing a ~500 KB incremental-cache entry (the Arabic dish
  // entries are the largest, because every Arabic character is two UTF-8 bytes).
  // On a cold isolate that parse plus the App Router reconstruction exceeds the
  // Free plan's 10 ms CPU cap — Error 1102, observed live on `ar /menu/<slug>`
  // while the English ones squeaked through. A static file is streamed
  // byte-for-byte, so the Worker pays none of it. `_worker.js` offers these to
  // the `ASSETS` binding before calling Next; a path with no file still renders
  // on demand and is edge-cached as before.
  const shells = await writeStaticShells(OUT);
  console.log(`Wrote ${shells} static shell(s).`);

  // Next serves `src/app/icon.svg`, `apple-icon.png` and `favicon.ico` as
  // *routes* (generated from the file convention), not as static assets, so
  // `_routes.json` cannot exclude them — every browser fetches the tab icon on
  // every visit, and each one ran the Worker to re-emit a byte-identical file.
  // That was a measurable slice of the free-plan CPU budget: on 2026-11-13
  // `/icon.svg` 504'd 377 times and `/apple-icon.png` 154 times, because a 77 KB
  // SVG built at request time exceeded the 10 ms cap. Copy them into the assets
  // root so Pages serves them straight from the CDN (and the exclude below keeps
  // them off the Worker). `favicon.ico` is already a `public/` file.
  for (const icon of ["icon.svg", "apple-icon.png", "favicon.ico"]) {
    const from = path.join(root, "src", "app", icon);
    if (existsSync(from)) await cp(from, path.join(OUT, icon));
  }

  const wrapper = await readFile(path.join(root, "scripts", "pages", "_worker.js"), "utf8");
  // Bake the build id in so the console-shell cache key changes on every deploy
  // (see `adminShellCacheUrl`). Without this the worker would key on a constant
  // and could serve a previous build's shell. The id ships in the assets tree
  // (already copied above), so read it from there.
  const buildId = await readFile(path.join(OUT, "BUILD_ID"), "utf8").catch(() => null);
  if (!buildId) {
    // A constant key would defeat the deploy-invalidation the key exists for.
    throw new Error("No BUILD_ID in the Pages output — cannot key the console shell.");
  }
  await writeFile(
    path.join(OUT, "_worker.js"),
    wrapper.replace("__BUILD_ID__", buildId.trim()),
    "utf8",
  );

  // The wrapper imports the edge-cache policy, which Pages does not copy for us.
  const edgeCache = await readFile(path.join(root, "scripts", "pages", "edge-cache.js"), "utf8");
  await writeFile(path.join(OUT, "edge-cache.js"), edgeCache, "utf8");

  // Keep static files off the Worker. In Pages advanced mode (an `_worker.js`),
  // *every* request invokes the worker — including `/_next/static/*`, fonts and
  // images — unless `_routes.json` excludes them. Verified live: a static chunk
  // carried the worker's own diagnostic header, so each asset of a single page
  // load was one Worker invocation against the Free plan's 100k/day budget,
  // spent re-serving bytes the CDN could answer itself. Excluding them here
  // means Pages serves those paths directly, which is both faster (no worker
  // cold start) and cheaper (no invocation, no CPU against the 10ms cap).
  // Only pure-asset trees are excluded; everything that may be a route — HTML
  // pages, `/_next/image`, API routes, `/robots.txt` (a route) — still reaches
  // the worker.
  //
  // The root-level icons, manifest and logo are listed individually because a
  // browser fetches several of them on *every* visit (`favicon.ico`,
  // `manifest.webmanifest`, the PWA icons) and each was a Worker invocation
  // spent re-serving a byte-identical file the CDN can answer itself. They are
  // plain files in this directory, so Pages serves them directly.
  const routes = {
    version: 1,
    include: ["/*"],
    exclude: [
      "/_next/static/*",
      "/mascots/*",
      "/fonts/*",
      "/favicon.ico",
      // Next metadata routes, copied into the assets root above so the CDN
      // answers the tab icon directly instead of running the Worker for a
      // byte-identical SVG/PNG on every visit.
      "/icon.svg",
      "/apple-icon.png",
      "/icon-192.png",
      "/icon-512.png",
      "/manifest.webmanifest",
      "/panda-logo.svg",
      // Media-proxy 302s any missing dish image here. Without this exclusion each
      // broken dish image re-enters the Worker to serve one static byte-identical
      // file; the CDN can answer it directly.
      "/dish-placeholder.svg",
      "/google469af7ac01566c8d.html",
    ],
  };
  await writeFile(path.join(OUT, "_routes.json"), JSON.stringify(routes, null, 2) + "\n", "utf8");

  await redactServerEnv(OUT);

  console.log("Pages output ready in .pages/");
}

/**
 * Extracts the `.html` of every prerendered dish/category page into a real file.
 *
 * The incremental-cache entries are `<html, rsc, segmentData>` JSON. Only the
 * `html` field is needed to serve a document, and reading it out of a ~500 KB
 * blob at request time is the cost that tripped the CPU cap. This walks the
 * copied cache tree and writes the document bytes to `<locale>/menu/<slug>.html`
 * — the layout Pages serves for the clean URL `/ar/menu/beef`.
 *
 * Scope is deliberately just `/menu/<slug>`. Those are the pages that exceeded
 * the 10 ms cap (the App Router reconstruction of a ~540 KB Arabic cache entry),
 * and they are guaranteed data-free: the route renders `<MenuSlugPage />`, a
 * client component that reads the dish from `/api/public/menu/<slug>` after
 * paint, and its metadata is generic. Home, `/menu`, about, faq and the rest
 * already warm below the cap and keep rendering through Next, so their
 * middleware (the markdown rewrite, the security headers) is untouched.
 */
async function writeStaticShells(outDir) {
  const cacheRoot = path.join(outDir, "cdn-cgi", "_next_cache");
  if (!existsSync(cacheRoot)) return 0;

  let written = 0;
  for (const buildDir of await readdir(cacheRoot)) {
    const root = path.join(cacheRoot, buildDir);
    const files = await collectFiles(root);
    for (const file of files) {
      if (!file.endsWith(".cache")) continue;
      // `/…/en/menu/double-box.cache` -> `/en/menu/double-box`
      const rel = path.relative(root, file).replace(/\.cache$/, "");
      const urlPath = "/" + rel.split(path.sep).join("/");
      if (!/^\/(?:en|ar)\/menu\/[^/]+$/.test(urlPath)) continue;
      if (!isCacheablePath(urlPath)) continue;
      let entry;
      try {
        entry = JSON.parse(await readFile(file, "utf8"));
      } catch {
        continue;
      }
      const html = typeof entry?.html === "string" ? entry.html : "";
      if (!html) continue;
      const target = path.join(outDir, `${rel}.html`);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, html, "utf8");
      written += 1;
    }
  }
  return written;
}

/** Every file under `dir`, recursively. */
async function collectFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectFiles(full)));
    else out.push(full);
  }
  return out;
}

/**
 * OpenNext compiles every value from `.env.local` (and friends) into
 * `cloudflare/next-env.mjs` so the worker can see it. That file ships inside
 * the deployment directory, so a server-only secret such as
 * SUPABASE_SERVICE_ROLE_KEY ends up sitting in the build output (verified: it
 * was served publicly from `/cloudflare/next-env.mjs`). Cloudflare injects
 * these as runtime bindings anyway, so the compiled copies are pure liability —
 * blank them, keeping the keys so lookups still resolve to "" instead of
 * undefined.
 */
async function redactServerEnv(outDir) {
  const file = path.join(outDir, "cloudflare", "next-env.mjs");
  if (!existsSync(file)) return;

  const source = await readFile(file, "utf8");
  const redacted = source.replace(
    /("(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|RESEND_API_KEY|EMAIL_FROM|AI_[A-Z0-9_]+)"\s*:\s*)"(?:[^"\\]|\\.)*"/g,
    '$1""',
  );

  const removed = source.length - redacted.length;
  await writeFile(file, redacted, "utf8");
  console.log(`Redacted server-only env values from next-env.mjs (${removed} bytes).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
