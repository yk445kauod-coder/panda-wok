/**
 * Panda Wok AI API worker.
 *
 * Thin HTTP front for the in-account Workers AI binding. The binding itself
 * needs no API key, but this worker is public once deployed, so every request
 * must present the shared bearer token (AI_API_TOKEN secret). The app's
 * Cloudflare remote provider points at this worker via
 * AI_CLOUDFLARE_BASE_URL + AI_CLOUDFLARE_API_KEY.
 */

export interface Env {
  AI: { run(model: string, body: Record<string, unknown>): Promise<unknown> };
  AI_API_TOKEN?: string;
  AI_DEFAULT_MODEL?: string;
}

const DEFAULT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function authorised(request: Request, env: Env): boolean {
  const expected = env.AI_API_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token || token.length !== expected.length) return false;
  // Constant-time compare so a wrong token cannot be discovered byte by byte.
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, worker: "panda-wok-ai-api" });
    }

    if (!authorised(request, env)) {
      return json({ error: "unauthorised" }, 401);
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    // Mirrors the Workers AI REST contract so the app's `cloudflare` remote
    // provider can point AI_CLOUDFLARE_BASE_URL at this worker unchanged:
    // POST /ai/run/<model>. Bare "/" is accepted as an alias.
    const pathMatch = /^\/ai\/run\/(.+)$/.exec(url.pathname);
    if (!pathMatch && url.pathname !== "/") {
      return json({ error: "not_found" }, 404);
    }
    const pathModel = pathMatch?.[1];

    let payload: {
      model?: string;
      messages?: { role: string; content: string }[];
      system?: string;
      max_tokens?: number;
      temperature?: number;
    };
    try {
      payload = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      return json({ error: "messages_required" }, 400);
    }

    const model =
      pathModel ?? payload.model ?? env.AI_DEFAULT_MODEL ?? DEFAULT_MODEL;

    try {
      const result = await env.AI.run(model, {
        messages: payload.messages,
        ...(payload.system ? { system: payload.system } : {}),
        max_tokens: payload.max_tokens ?? 512,
        temperature: payload.temperature ?? 0.4,
      });
      // The app's parseCloudflare() reads `result` (or result.response), so the
      // binding output is returned as-is under `result`, exactly like the
      // upstream Cloudflare REST endpoint does.
      return json({ result, model });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Workers AI request failed";
      return json({ error: "ai_request_failed", detail: message }, 502);
    }
  },
};

export default worker;
