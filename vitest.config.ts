import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// `.env.local` is Next's convention and vitest does not read it, so a test that
// imports a module reaching `src/lib/config/env.ts` (which throws on missing
// public keys) failed at import rather than on an assertion. This minimal
// parser loads the file into the test process without duplicating the values.
// An already-set process env always wins, so CI can override.
try {
  const raw = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trim().startsWith("#")) continue;
    const [, key, value] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = value.replace(/^(['"])(.*)\1$/, "$2");
  }
} catch {
  // No .env.local (e.g. a fresh clone or CI): env-dependent suites will skip.
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js aliases `server-only` internally; provide a resolvable stub for
      // unit tests that import server modules like lib/auth/phone.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
