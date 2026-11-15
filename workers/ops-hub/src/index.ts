/**
 * The live hub: one Durable Object that pushes console updates.
 *
 * The console used to learn about a new order by asking. Every open tab ran its
 * own poll — measured at 23,682 Worker invocations in a day for a single admin —
 * and the Free plan's 100k/day is shared with the customer site, so two or three
 * admins watching the board at once exhausted it. The poll could not relax
 * either: the relaxation depends on Supabase Realtime being up, and Realtime is
 * on the restricted project, so the 8-second cadence was permanent.
 *
 * This inverts it. The server writes a nudge when an order changes, and every
 * open console learns about it in the same tick. A tab that is open but idle
 * costs nothing; a tab that is *closed* costs nothing; three admins cost one
 * write, not three reads every eight seconds.
 *
 * The poll stays as the fallback for a dropped socket, but it can finally relax,
 * because `isLive()` here is the real signal rather than a socket that never
 * connects.
 *
 * A Durable Object is the right primitive: it is a single-threaded point that
 * every connection can be registered with, it holds them across the Worker
 * invocations that would otherwise each start from nothing, and it hibernates
 * when no one is listening, so an empty restaurant is not billed for an idle
 * process.
 */

export interface Env {
  OPS_HUB: DurableObjectNamespace;
  /**
   * Shared secret for the internal `/broadcast` call.
   *
   * The hub's public URL is reachable by anyone, and a `/broadcast` without a
   * check would let a stranger ring the kitchen's alarm with a fake order, or
   * bury a real one. The Worker that writes an order is the only caller and it
   * sends this header.
   */
  OPS_TOKEN?: string;
}

/** The instance name every console shares. */
export const HUB_INSTANCE = "ops";

type Attachment = { kind: "console" | "customer"; userId: string | null };

const MAX_FRAME_BYTES = 64 * 1024;

/**
 * One Durable Object instance holds every open console connection.
 *
 * Hibernation is what makes this cheap: a WebSocket accepted through
 * `state.acceptWebSocket` costs nothing while the object is asleep, and the
 * object wakes on the next `broadcast()` or inbound message. The alternative —
 * an ordinary listener set with `addEventListener` — keeps the object billed
 * for as long as a tab is open, which is exactly the cost being removed.
 */
export class OpsHub {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal write path: the Worker, having just written an order, tells the
    // hub what changed. It is not reachable from the public internet (the Worker
    // only ever calls it itself) but it is still validated.
    if (url.pathname === "/broadcast") {
      if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
      // Fail closed. The hub's URL is public, so a `/broadcast` that is open
      // when the secret is missing lets anyone ring the kitchen's alarm with a
      // fake order or bury a real one. Refusing is the only safe default: a
      // misconfigured deploy then has no live push (the poll covers it) instead
      // of an open write endpoint. Verified live before this change: with no
      // secret set, an unauthenticated POST returned 200.
      const expected = this.env?.OPS_TOKEN;
      if (!expected || request.headers.get("x-ops-token") !== expected) {
        return new Response("forbidden", { status: 403 });
      }
      const body = (await request.json().catch(() => null)) as
        | { kind?: string; table?: string; ids?: string[]; audience?: string }
        | null;
      if (!body || typeof body.kind !== "string") {
        return new Response("bad request", { status: 400 });
      }
      const delivered = this.broadcast({
        kind: body.kind,
        table: typeof body.table === "string" ? body.table : undefined,
        ids: Array.isArray(body.ids) ? body.ids.filter((i) => typeof i === "string") : undefined,
        audience: body.audience === "customer" ? "customer" : "console",
      });
      return Response.json({ delivered });
    }

    if (url.pathname === "/status") {
      // Counts only; never the socket list or the user ids behind it.
      return Response.json({ connections: this.state.getWebSockets().length, live: this.isLive() });
    }

    // The subscription endpoint the browser opens.
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected a websocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const audience = url.searchParams.get("audience") === "customer" ? "customer" : "console";
    const userId = url.searchParams.get("uid");
    const attachment: Attachment = {
      kind: audience,
      userId: userId && /^[0-9a-fA-F-]{8,64}$/.test(userId) ? userId : null,
    };

    // Hibernatable accept: the object may be evicted between messages and the
    // attachment survives with the socket, so `webSocketMessage` still knows who
    // is on the other end after a wake.
    this.state.acceptWebSocket(server, [audience]);
    server.serializeAttachment(attachment);

    server.send(
      JSON.stringify({
        kind: "hello",
        audience,
        at: new Date().toISOString(),
        live: this.isLive(),
      }),
    );

    const init: WebSocketResponseInit = { status: 101, webSocket: client };
    return new Response(null, init);
  }

  /**
   * A socket message. The client uses this for two things only: a heartbeat, and
   * a pong. Anything else is ignored rather than acted on, so a malformed frame
   * from a stale tab cannot do anything.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > MAX_FRAME_BYTES) return;
    if (message === "ping") {
      ws.send("pong");
      return;
    }
    try {
      const parsed = JSON.parse(message) as { kind?: string };
      if (parsed?.kind === "ping") ws.send(JSON.stringify({ kind: "pong", at: Date.now() }));
    } catch {
      // Not JSON and not the heartbeat: nothing to do.
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // 1006 is "abnormal closure" and must not be echoed back; the platform
    // rejects an attempt to close with it.
    const safe = code === 1006 ? 1000 : code;
    try {
      ws.close(safe, reason);
    } catch {
      // Already closing.
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {
      // Already gone.
    }
  }

  /** True once a console has connected, so the poll can relax to the slow net. */
  private isLive(): boolean {
    return this.state.getWebSockets("console").length > 0;
  }

  /** Send `payload` to every socket in the audience. Returns how many got it. */
  private broadcast(payload: {
    kind: string;
    table?: string;
    ids?: string[];
    audience: "console" | "customer";
  }): number {
    const frame = JSON.stringify({ ...payload, at: new Date().toISOString() });
    let delivered = 0;

    for (const ws of this.state.getWebSockets(payload.audience)) {
      try {
        ws.send(frame);
        delivered += 1;
      } catch {
        // A dead socket: dropping it here is fine, the close handler runs too.
      }
    }
    return delivered;
  }
}

/**
 * The Worker entrypoint: route every request to the single hub instance.
 *
 * A Worker with a Durable Object binding still needs a default handler; without
 * one the platform has nothing to call and answers 404 (which is exactly what a
 * deploy without this export did). Everything goes to one named instance so that
 * every console in the world shares one socket registry.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.OPS_HUB.idFromName(HUB_INSTANCE);
    return env.OPS_HUB.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;
