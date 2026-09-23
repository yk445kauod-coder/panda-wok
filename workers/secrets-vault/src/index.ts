/**
 * Panda Wok secrets vault worker.
 *
 * Single server-side source of truth for the platform's service keys. The app
 * worker holds only a shared bearer token (VAULT_TOKEN) and pulls what it needs
 * at runtime, so rotating a key means re-uploading one secret here instead of
 * redeploying the app. Values themselves are worker secrets, never vars.
 *
 * Access rules:
 *  - /health is open and reports names only, never values.
 *  - /secrets/:name requires the shared bearer token and returns one value.
 *  - /secrets with no name is refused: there is no bulk-dump endpoint.
 */

export interface Env {
  VAULT_TOKEN?: string;
  [key: string]: unknown;
}

/** Keys this vault is allowed to hand out. Anything else is 404. */
const ALLOWED = new Set([
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "CLOUDFLARE_AI_API_KEY",
  "AI_API_TOKEN",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function authorised(request: Request, env: Env): boolean {
  const expected = typeof env.VAULT_TOKEN === "string" ? env.VAULT_TOKEN : "";
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token || token.length !== expected.length) return false;
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
      const names = [...ALLOWED].filter(
        (name) => typeof env[name] === "string" && env[name] !== "",
      );
      return json({ ok: true, worker: "panda-wok-secrets", available: names });
    }

    if (!authorised(request, env)) {
      return json({ error: "unauthorised" }, 401);
    }

    const match = /^\/secrets\/([A-Z0-9_]+)$/.exec(url.pathname);
    if (!match) {
      // Deliberately no "list everything" route.
      return json({ error: "not_found" }, 404);
    }

    const name = match[1];
    if (!ALLOWED.has(name)) {
      return json({ error: "not_found" }, 404);
    }

    const value = env[name];
    if (typeof value !== "string" || value === "") {
      return json({ error: "not_configured", name }, 404);
    }

    return json({ name, value });
  },
};

export default worker;
