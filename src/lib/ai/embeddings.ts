import "server-only";
import { getWorkersAiBinding, resolveSecretValueWithEnv } from "@/lib/ai/provider";
import { serverEnv } from "@/lib/config/env";

/**
 * Free embeddings.
 *
 * Cloudflare Workers AI ships `@cf/baai/bge-m3` — multilingual (Arabic and
 * English both embed well) and, crucially, *keyless* through the in-account AI
 * binding. That means vector memory costs nothing beyond the plan the project
 * already runs on, and no third party ever sees the text.
 *
 * Resolution order mirrors the text provider chain:
 *   1. the Workers AI binding (the Worker, `wrangler dev`)
 *   2. the panda-wok-ai-api worker (plain `next dev`, or any non-Worker host)
 *
 * When neither is reachable the caller gets `null`, and the memory layer degrades
 * to lexical matching rather than throwing — memory is an enhancement, never a
 * hard dependency.
 */

const EMBEDDING_MODEL = "@cf/baai/bge-m3";
/** bge-m3 emits 1024 dimensions; the DB column is `vector(1024)`. */
export const EMBEDDING_DIMENSIONS = 1024;

type Binding = { run(model: string, body: Record<string, unknown>): Promise<unknown> };

/** Pulls a number[][] out of either the binding or the worker's REST envelope. */
function parseEmbedding(raw: unknown): number[] | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  // The REST worker wraps the platform response under `result`.
  const inner = (record.result && typeof record.result === "object"
    ? (record.result as Record<string, unknown>)
    : record);

  const data = inner.data ?? inner.embedding;
  if (Array.isArray(data)) {
    // bge returns number[][] (one vector per input); take the first.
    const first = data[0];
    if (Array.isArray(first) && typeof first[0] === "number") return first as number[];
    if (typeof data[0] === "number") return data as number[];
  }
  return null;
}

async function embedViaBinding(binding: Binding, text: string): Promise<number[] | null> {
  try {
    const result = await binding.run(EMBEDDING_MODEL, { text: [text] });
    return parseEmbedding(result);
  } catch {
    return null;
  }
}

/**
 * The Workers AI REST path. It needs the account id and a token, which live in
 * Vault (set from the admin AI centre) or the runtime env — but the account/token
 * names are not in the validated `serverEnv` schema, so they are resolved against
 * the raw `process.env` as well. That is what makes embeddings work in plain
 * `next dev` and in a script, not only inside the Worker binding.
 */
async function embedViaCloudflareRest(text: string): Promise<number[] | null> {
  const env = process.env as Record<string, string | undefined>;
  const accountId = await resolveSecretValueWithEnv("AI_CLOUDFLARE_ACCOUNT_ID", env);
  const token = await resolveSecretValueWithEnv("AI_CLOUDFLARE_API_TOKEN", env);
  if (!accountId || !token) return null;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBEDDING_MODEL}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: [text] }),
        // Embeddings are small and fast; a hung request must not stall a search.
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return null;
    return parseEmbedding(await response.json());
  } catch {
    return null;
  }
}

async function embedViaWorker(text: string): Promise<number[] | null> {
  const base = (serverEnv as Record<string, string | undefined>)["AI_CLOUDFLARE_BASE_URL"];
  const token = (serverEnv as Record<string, string | undefined>)["AI_CLOUDFLARE_API_KEY"];
  if (!base || !token) return null;

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/ai/run/${EMBEDDING_MODEL}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: [text] }),
      // Embeddings are small and fast; a hung request must not stall a search.
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return parseEmbedding(await response.json());
  } catch {
    return null;
  }
}

/** Embeds one string, or returns null when no embedding service is reachable. */
export async function embedText(text: string): Promise<number[] | null> {
  const clean = text.trim();
  if (!clean) return null;

  const binding = await getWorkersAiBinding();
  if (binding) {
    const embedding = await embedViaBinding(binding.ai as Binding, clean);
    if (embedding) return embedding;
  }
  const viaRest = await embedViaCloudflareRest(clean);
  if (viaRest) return viaRest;
  return embedViaWorker(clean);
}

/** Embeds many strings in one call where the transport allows it. */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const cleaned = texts.map((t) => t.trim());
  if (cleaned.length === 0) return [];

  const binding = await getWorkersAiBinding();
  if (binding) {
    try {
      const result = await (binding.ai as Binding).run(EMBEDDING_MODEL, { text: cleaned });
      const parsed = result as { data?: number[][] };
      if (Array.isArray(parsed?.data)) {
        return parsed.data.map((v) => (Array.isArray(v) ? v : null));
      }
    } catch {
      // fall through to per-item embedding
    }
  }

  return Promise.all(cleaned.map((text) => embedText(text)));
}

/** pgvector literal, e.g. "[0.1,0.2,...]". Null passes through as null. */
export function toVectorLiteral(embedding: number[] | null): string | null {
  if (!embedding || embedding.length === 0) return null;
  return `[${embedding.join(",")}]`;
}
