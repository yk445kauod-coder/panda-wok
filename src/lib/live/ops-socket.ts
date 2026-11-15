/**
 * The console's live socket, replacing Supabase Realtime.
 *
 * `use-ops-signal.ts` used to open a Supabase Realtime channel and treat the
 * poll as the dependable fallback. On the restricted project Realtime never
 * connects, so the fallback was permanent and the console polled at the fast
 * cadence forever — that is where the invocation budget went.
 *
 * This connects to the `OpsHub` Durable Object instead, which is ours and is
 * always up. It keeps the same shape as the module it replaces: a shared socket
 * per tab, a `live` flag the poll reads, and a `refreshOpsNow()` the realtime
 * path called. The poll stays as the net, but now `live` can actually be true,
 * so it relaxes to a long safety-net cadence.
 *
 * If the socket cannot be opened at all (a browser behind a proxy that strips
 * WebSockets, a deploy without the hub bound) the module degrades to exactly the
 * old behaviour: `live` stays false and the poll carries the console.
 */

type Listener = () => void;
type LiveListener = () => void;

const listeners = new Set<Listener>();
const liveListeners = new Set<LiveListener>();

let socket: WebSocket | null = null;
let live = false;
let reconnectDelay = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let closedByUs = false;
/** Timestamp of the last frame from the hub, for the half-open-socket guard. */
let lastFrame = 0;

const HEARTBEAT_MS = 25_000;
/**
 * How long a socket may go without a frame before it is treated as dead.
 *
 * The hub answers every ping with a pong, so silence across more than two
 * heartbeats means the socket is half-open: open as far as the browser knows,
 * but delivering nothing. That matters now that the live poll is two minutes —
 * without this guard a zombie socket would hold `live` true and freeze the
 * console for the whole interval, because `onclose` never fires for a half-open
 * connection. Closing it drops the tab to the fallback cadence and the
 * reconnect backoff.
 */
const STALE_MS = 60_000;

/**
 * The hub's WebSocket origin.
 *
 * Read from the page at runtime rather than baked in at build: a preview
 * deployment should reach the same hub, and a hard-coded host would make that
 * impossible. The Worker publishes `OPS_HUB_URL` into the document as
 * `window.__PW_OPS_HUB__`; when it is absent the socket is simply not opened and
 * the poll carries the console, which is the pre-existing behaviour.
 */
function hubOrigin(): string | null {
  const injected = (window as unknown as { __PW_OPS_HUB__?: string }).__PW_OPS_HUB__;
  if (!injected) return null;
  try {
    return new URL(injected).origin;
  } catch {
    return null;
  }
}

function setLive(next: boolean): void {
  if (live === next) return;
  live = next;
  for (const listener of liveListeners) listener();
}

export function getOpsLive(): boolean {
  return live;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Build the WebSocket URL from the page origin, with the user for the customer channel. */
function socketUrl(origin: string, userId: string | null): string {
  const scheme = origin.startsWith("https:") ? "wss:" : "ws:";
  const host = origin.replace(/^https?:\/\//, "");
  const params = new URLSearchParams({ audience: "console" });
  if (userId) params.set("uid", userId);
  return `${scheme}//${host}/?${params.toString()}`;
}

/**
 * Reconnect with backoff. A restaurant's wifi drops; the console must not give
 * up and must not hammer either. The delay doubles to 30s and a successful open
 * resets it.
 */
function scheduleReconnect(): void {
  if (closedByUs || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    connect(null);
  }, reconnectDelay);
}

function connect(userId: string | null): void {
  if (socket || typeof window === "undefined") return;

  const origin = hubOrigin();
  if (!origin) return;

  try {
    const ws = new WebSocket(socketUrl(origin, userId));
    socket = ws;

    ws.onopen = () => {
      reconnectDelay = 1000;
      lastFrame = Date.now();
      setLive(true);
      // A heartbeat keeps an idle socket alive through intermediaries that drop
      // silent connections, and doubles as a liveness check: the hub answers
      // every ping, so a socket that has gone quiet is half-open and closed.
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (Date.now() - lastFrame > STALE_MS) {
          try {
            ws.close();
          } catch {
            // Already closed; onclose owns the reconnect.
          }
          return;
        }
        try {
          ws.send(JSON.stringify({ kind: "ping" }));
        } catch {
          // The close handler will reconnect.
        }
      }, HEARTBEAT_MS);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      lastFrame = Date.now();
      try {
        const payload = JSON.parse(event.data) as { kind?: string };
        if (payload.kind === "pong") return;
        // Any other frame is a change: re-read on the shared beat.
        notify();
      } catch {
        // A frame we do not understand is not a reason to disconnect.
      }
    };

    ws.onclose = () => {
      socket = null;
      setLive(false);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      // `onclose` follows and owns the reconnect.
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    };
  } catch {
    // Construction itself failed (an unsupported URL, a blocked scheme).
    socket = null;
    setLive(false);
    scheduleReconnect();
  }
}

/**
 * Subscribe to the console signal. The first consumer opens the socket and the
 * last one closes it, so a tab that navigates between boards keeps one
 * connection rather than opening one per page.
 */
export function subscribeOpsSignal(onChange: Listener, userId: string | null = null): () => void {
  listeners.add(onChange);
  if (listeners.size === 1) {
    closedByUs = false;
    connect(userId);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      closedByUs = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      try {
        socket?.close();
      } catch {
        // Already closed.
      }
      socket = null;
      setLive(false);
    }
  };
}

/** Subscribe to just the `live` flag, for the poll's cadence decision. */
export function subscribeOpsLive(listener: LiveListener): () => void {
  liveListeners.add(listener);
  return () => liveListeners.delete(listener);
}

/**
 * The name the old Realtime module exported. A broadcast ping and this both mean
 * "something changed, re-read now", and the shared store coalesces the burst.
 */
export { refreshOpsNow } from "@/lib/live/ops-sync";
