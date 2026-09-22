import { z } from "zod";

/**
 * Environment is validated once at module load. A missing public Supabase
 * config is a hard failure: every page depends on it, so failing loudly at
 * startup beats rendering a broken shell.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
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
});

function parsePublic() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Invalid public environment configuration (${missing}). ` +
        "Run `python3 scripts/setup-env.py` or copy .env.example to .env.local.",
    );
  }
  return parsed.data;
}

export const publicEnv = parsePublic();

export const serverEnv = serverSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  AI_PROVIDER_KIND: process.env.AI_PROVIDER_KIND,
  AI_MODEL: process.env.AI_MODEL,
  AI_BASE_URL: process.env.AI_BASE_URL,
  AI_API_KEY: process.env.AI_API_KEY,
  AI_FALLBACK_MODEL: process.env.AI_FALLBACK_MODEL,
  AI_OPENROUTER_MODEL: process.env.AI_OPENROUTER_MODEL,
  AI_OPENROUTER_BASE_URL: process.env.AI_OPENROUTER_BASE_URL,
  AI_OPENROUTER_API_KEY: process.env.AI_OPENROUTER_API_KEY,
  AI_OPENROUTER_NAME: process.env.AI_OPENROUTER_NAME,
  AI_CLOUDFLARE_MODEL: process.env.AI_CLOUDFLARE_MODEL,
  AI_CLOUDFLARE_BASE_URL: process.env.AI_CLOUDFLARE_BASE_URL,
  AI_CLOUDFLARE_API_KEY: process.env.AI_CLOUDFLARE_API_KEY,
  AI_CLOUDFLARE_NAME: process.env.AI_CLOUDFLARE_NAME,
  AI_POLLINATIONS_MODEL: process.env.AI_POLLINATIONS_MODEL,
  AI_POLLINATIONS_BASE_URL: process.env.AI_POLLINATIONS_BASE_URL,
  AI_POLLINATIONS_API_KEY: process.env.AI_POLLINATIONS_API_KEY,
  AI_POLLINATIONS_NAME: process.env.AI_POLLINATIONS_NAME,
  AI_GEMINI_MODEL: process.env.AI_GEMINI_MODEL,
  AI_GEMINI_BASE_URL: process.env.AI_GEMINI_BASE_URL,
  AI_GEMINI_API_KEY: process.env.AI_GEMINI_API_KEY,
  AI_GEMINI_NAME: process.env.AI_GEMINI_NAME,
  AI_ANTHROPIC_MODEL: process.env.AI_ANTHROPIC_MODEL,
  AI_ANTHROPIC_BASE_URL: process.env.AI_ANTHROPIC_BASE_URL,
  AI_ANTHROPIC_API_KEY: process.env.AI_ANTHROPIC_API_KEY,
  AI_ANTHROPIC_NAME: process.env.AI_ANTHROPIC_NAME,
  AI_OPENAI_COMPATIBLE_MODEL: process.env.AI_OPENAI_COMPATIBLE_MODEL,
  AI_OPENAI_COMPATIBLE_BASE_URL: process.env.AI_OPENAI_COMPATIBLE_BASE_URL,
  AI_OPENAI_COMPATIBLE_API_KEY: process.env.AI_OPENAI_COMPATIBLE_API_KEY,
  AI_OPENAI_COMPATIBLE_NAME: process.env.AI_OPENAI_COMPATIBLE_NAME,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
});

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
