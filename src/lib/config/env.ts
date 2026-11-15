import { z } from "zod";

/**
 * Server-only environment. The three public Supabase values live in
 * `public-env.ts` instead, so this module — and its zod dependency — never
 * reaches the middleware or the browser bundle.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  /** `d1` switches the app off Supabase; anything else keeps it. See src/lib/d1/backend.ts. */
  DATA_BACKEND: z.string().optional(),
  /** The live hub (Durable Object) origin the console opens its socket to. */
  OPS_HUB_URL: z.string().optional(),
  /**
   * HMAC key for the D1 backend's customer session cookies.
   *
   * Optional in the schema but required in practice: `d1-session.ts` refuses to
   * mint or accept a session when it is missing, rather than signing with a
   * default an attacker could read from the source and use to forge any account.
   * The Supabase backend does not read it.
   */
  AUTH_SECRET: z.string().min(32).optional(),
  AI_PROVIDER_KIND: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_BASE_URL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_FALLBACK_MODEL: z.string().optional(),
  AI_OPENROUTER_MODEL: z.string().optional(),
  AI_OPENROUTER_BASE_URL: z.string().optional(),
  AI_OPENROUTER_API_KEY: z.string().optional(),
  AI_OPENROUTER_NAME: z.string().optional(),
  AI_CLOUDFLARE_MODEL: z.string().optional(),
  AI_CLOUDFLARE_BASE_URL: z.string().optional(),
  AI_CLOUDFLARE_API_KEY: z.string().optional(),
  AI_CLOUDFLARE_NAME: z.string().optional(),
  AI_POLLINATIONS_MODEL: z.string().optional(),
  AI_POLLINATIONS_BASE_URL: z.string().optional(),
  AI_POLLINATIONS_API_KEY: z.string().optional(),
  AI_POLLINATIONS_NAME: z.string().optional(),
  AI_GEMINI_MODEL: z.string().optional(),
  AI_GEMINI_BASE_URL: z.string().optional(),
  AI_GEMINI_API_KEY: z.string().optional(),
  AI_GEMINI_NAME: z.string().optional(),
  AI_ANTHROPIC_MODEL: z.string().optional(),
  AI_ANTHROPIC_BASE_URL: z.string().optional(),
  AI_ANTHROPIC_API_KEY: z.string().optional(),
  AI_ANTHROPIC_NAME: z.string().optional(),
  AI_OPENAI_COMPATIBLE_MODEL: z.string().optional(),
  AI_OPENAI_COMPATIBLE_BASE_URL: z.string().optional(),
  AI_OPENAI_COMPATIBLE_API_KEY: z.string().optional(),
  AI_OPENAI_COMPATIBLE_NAME: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // Shared passcode that fronts the whole /admin surface, on top of the
  // staff-role check. Optional: unset falls back to the built-in default.
  ADMIN_PASSCODE: z.string().min(4).optional(),
});

/**
 * Server-only values are read through a computed lookup, not `process.env.NAME`.
 * Next.js statically replaces the latter at build time, which bakes the value
 * into the deployed server bundle (verified: the service role key appeared in
 * `.pages/cloudflare/next-env.mjs`). These are Cloudflare runtime bindings, so
 * they should only ever exist in the worker's environment at request time —
 * a computed access keeps them out of the bundle entirely, so a routing
 * mistake can never turn a build artefact into a leaked credential.
 */
function runtimeEnv(name: string): string | undefined {
  const value = process.env[name];
  // The build redacts these keys to "" in next-env.mjs, and Cloudflare only
  // overwrites them when the binding is actually set. Normalising "" to
  // undefined keeps `serviceRoleAvailable()` honest and lets the optional
  // schema entries stay optional instead of failing `.min()` on a blank value.
  return value ? value : undefined;
}

const SERVER_ONLY_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATA_BACKEND",
  "OPS_HUB_URL",
  "AUTH_SECRET",
  "AI_PROVIDER_KIND",
  "AI_MODEL",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_FALLBACK_MODEL",
  "AI_OPENROUTER_MODEL",
  "AI_OPENROUTER_BASE_URL",
  "AI_OPENROUTER_API_KEY",
  "AI_OPENROUTER_NAME",
  "AI_CLOUDFLARE_MODEL",
  "AI_CLOUDFLARE_BASE_URL",
  "AI_CLOUDFLARE_API_KEY",
  "AI_CLOUDFLARE_NAME",
  "AI_POLLINATIONS_MODEL",
  "AI_POLLINATIONS_BASE_URL",
  "AI_POLLINATIONS_API_KEY",
  "AI_POLLINATIONS_NAME",
  "AI_GEMINI_MODEL",
  "AI_GEMINI_BASE_URL",
  "AI_GEMINI_API_KEY",
  "AI_GEMINI_NAME",
  "AI_ANTHROPIC_MODEL",
  "AI_ANTHROPIC_BASE_URL",
  "AI_ANTHROPIC_API_KEY",
  "AI_ANTHROPIC_NAME",
  "AI_OPENAI_COMPATIBLE_MODEL",
  "AI_OPENAI_COMPATIBLE_BASE_URL",
  "AI_OPENAI_COMPATIBLE_API_KEY",
  "AI_OPENAI_COMPATIBLE_NAME",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  // Read through the computed lookup like the other server-only values so the
  // passcodes never get inlined into the deployed bundle.
  "ADMIN_PASSCODE",
] as const;

export const serverEnv = serverSchema.parse(
  Object.fromEntries(SERVER_ONLY_KEYS.map((key) => [key, runtimeEnv(key)])),
);

/**
 * A configured external model provider is optional. When absent the AI layer
 * degrades to the deterministic, database-grounded provider rather than
 * erroring, which keeps the assistant useful without an API key.
 *
 * Configuration counts as present when EITHER the generic block (AI_MODEL +
 * AI_API_KEY) or any fully-populated scoped provider block (e.g.,
 * AI_OPENROUTER_MODEL + AI_OPENROUTER_API_KEY) is set. This matches the
 * chain builder, which prefers the scoped block of the selected kind.
 */
export function externalAiConfigured(): boolean {
  const generic = Boolean(
    serverEnv.AI_BASE_URL && serverEnv.AI_MODEL && serverEnv.AI_API_KEY,
  );
  const scoped = [
    "OPENROUTER",
    "CLOUDFLARE",
    "POLLINATIONS",
    "GEMINI",
    "ANTHROPIC",
    "OPENAI_COMPATIBLE",
  ].some((prefix) => {
    const env = serverEnv as Record<string, string | undefined>;
    return Boolean(env[`AI_${prefix}_MODEL`] && env[`AI_${prefix}_API_KEY`]);
  });
  return generic || scoped;
}

export function serviceRoleAvailable(): boolean {
  return Boolean(serverEnv.SUPABASE_SERVICE_ROLE_KEY);
}
