/**
 * The two public Supabase values, read without a validation library.
 *
 * This is deliberately separate from `env.ts`. That module validates the whole
 * server surface with zod, and zod is ~450 KB of the middleware bundle — the
 * middleware imports `publicEnv` to build the Supabase client, which dragged the
 * entire schema validator onto *every* request (documents, API routes, assets)
 * and pushed routine renders past the Free plan's 10 ms CPU cap (Error 1102).
 * Reading three values here costs nothing, so the middleware, the browser client
 * and the metadata helpers stay small.
 *
 * Server-only values still live in `env.ts`; nothing here is a secret.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Invalid public environment configuration (${name}). ` +
        "Run `python3 scripts/setup-env.py` or copy .env.example to .env.local.",
    );
  }
  return value;
}

export const publicEnv = {
  get NEXT_PUBLIC_SUPABASE_URL(): string {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  get NEXT_PUBLIC_SITE_URL(): string {
    return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  },
};
