import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

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

  const wrapper = await readFile(path.join(root, "scripts", "pages", "_worker.js"), "utf8");
  await writeFile(path.join(OUT, "_worker.js"), wrapper, "utf8");

  await redactServerEnv(OUT);

  console.log("Pages output ready in .pages/");
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
