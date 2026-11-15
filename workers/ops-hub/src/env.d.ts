/**
 * The Cloudflare runtime types this worker uses, declared locally.
 *
 * `@cloudflare/workers-types` cannot be installed here — it collides with the
 * pinned `@types/node` in the app's dependency tree — and `wrangler` bundles with
 * esbuild, which does not typecheck. Declaring the handful of globals this worker
 * actually touches keeps it type-safe without adding a dependency that breaks the
 * install. Anything not declared here is not used by `src/index.ts`.
 */

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectState {
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
  waitUntil(promise: Promise<unknown>): void;
}

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};

interface ExportedHandler<Env = unknown> {
  fetch?(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/**
 * The hibernatable-WebSocket extensions workerd adds to the standard `WebSocket`.
 * They are not in lib.dom, so they are declared here rather than cast away at
 * each call site.
 */
interface WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

/**
 * The 101 upgrade response carries the client socket. workerd accepts
 * `webSocket` on `ResponseInit`; lib.dom does not, so the call site casts to
 * this instead of widening the standard type.
 */
type WebSocketResponseInit = ResponseInit & { webSocket: WebSocket };
