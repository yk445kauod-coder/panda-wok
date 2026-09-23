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

  console.log("Pages output ready in .pages/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
