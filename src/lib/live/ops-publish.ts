/**
 * Publishing a nudge to the live hub.
 *
 * The Worker calls this right after it writes an order (or a status change, or a
 * notification), so every open console hears about it on the same tick instead
 * of each discovering it on its own poll.
 *
 * Two properties matter:
 *
 *  - It never fails the write. A nudge is a hint; the console still has its
 *    poll. `waitUntil` keeps it off the response path, and a rejected promise is
 *    swallowed so a hub that is down cannot turn a placed order into a 500.
 *  - It is cheap. One `fetch` to a Durable Object, no database read, and it is
 *    skipped entirely when the binding is absent (a local dev run, a preview
 *    without the hub).
 */

export type OpsEvent = {
  /** What happened: `order.created`, `order.updated`, `notification.created`, … */
  kind: string;
  /** The table that changed, for a board that only cares about some of them. */
  table?: string;
  /**
   * Row ids, for a board that wants to fetch just what changed.
   *
   * **Never set this on a console event.** The hub's socket is public, so a
   * payload carrying ids would leak which orders exist to anyone who opens it.
   * The console does not need them — it re-reads through the gated admin routes
   * — so console events stay content-free and this is reserved for a future
   * per-customer channel where the recipient is already entitled to the id.
   */
  ids?: string[];
  /** Who should hear it. The console is the default. */
  audience?: "console" | "customer";
};

type HubBinding = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string | Request, init?: RequestInit): Promise<Response> };
};

type PublishEnv = {
  OPS_HUB?: HubBinding;
  OPS_HUB_URL?: string;
  OPS_TOKEN?: string;
};

type WaitUntilContext = { waitUntil(promise: Promise<unknown>): void };

const HUB_NAME = "ops";

/**
 * `env.OPS_HUB` when the Worker is bound to the hub. Typed structurally so this
 * module does not import `@cloudflare/workers-types` into the Next build.
 */
function hubFor(env: unknown): HubBinding | null {
  const binding = (env as PublishEnv | null)?.OPS_HUB;
  return binding && typeof binding.idFromName === "function" ? binding : null;
}

/**
 * The hub's public origin, when this deployment reaches it over HTTPS.
 *
 * The hub is a separate Worker (Pages cannot own a Durable Object namespace), so
 * the app usually has no `OPS_HUB` binding and talks to it by URL instead. Both
 * routes are supported because a Worker-hosted deploy *can* bind it directly,
 * which avoids a network hop.
 */
function hubUrl(env: unknown): string | null {
  const url = (env as PublishEnv | null)?.OPS_HUB_URL;
  if (typeof url !== "string" || !url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget a nudge. Never throws and never delays the response.
 *
 * `ctx` is optional so a caller that has no `ExecutionContext` (a test, a script)
 * still works; the fetch then runs without being held open, which is fine for a
 * hint.
 */
export function publishOpsEvent(
  env: unknown,
  ctx: WaitUntilContext | null,
  event: OpsEvent,
): void {
  const binding = hubFor(env);
  const url = hubUrl(env);
  if (!binding && !url) return;

  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = (env as PublishEnv | null)?.OPS_TOKEN;
  if (token) headers["x-ops-token"] = token;
  const body = JSON.stringify(event);

  const run = async () => {
    try {
      if (binding) {
        const stub = binding.get(binding.idFromName(HUB_NAME));
        await stub.fetch("https://ops-hub.internal/broadcast", { method: "POST", headers, body });
        return;
      }
      await fetch(`${url}/broadcast`, { method: "POST", headers, body });
    } catch {
      // The console's poll is the fallback; a failed nudge is not an error.
    }
  };

  const promise = run();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(promise);
}

/** The number of consoles currently connected, for a health check. */
export async function opsHubStatus(env: unknown): Promise<{ live: boolean; connections: number }> {
  const hub = hubFor(env);
  if (!hub) return { live: false, connections: 0 };
  try {
    const response = await hub.get(hub.idFromName(HUB_NAME)).fetch("https://ops-hub.internal/status");
    return (await response.json()) as { live: boolean; connections: number };
  } catch {
    return { live: false, connections: 0 };
  }
}
