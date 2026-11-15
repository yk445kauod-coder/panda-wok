/**
 * Which database the app reads and writes.
 *
 * `DATA_BACKEND=d1` routes every `createServerSupabase()` call to the
 * Cloudflare-native shim in `src/lib/d1`, which speaks the same
 * `supabase-js`-shaped API over D1. Anything else — or an unset value — keeps
 * Supabase. That default matters: the two backends have to be swappable without
 * a code change, so a bad D1 deploy can be reverted by editing one variable and
 * redeploying, not by reverting a merge.
 *
 * It is read per call rather than cached at module load because a Worker isolate
 * is reused across requests and the value can differ between a preview and
 * production deployment.
 */
export type DataBackend = "supabase" | "d1";

/**
 * Reads `DATA_BACKEND` straight off the environment.
 *
 * This module is reachable from the middleware (which branches on the backend
 * when it verifies a session), and `config/env.ts` validates through zod.
 * Importing it here would ship the validator in the middleware bundle on every
 * request — the regression behind Error 1102 on the Free plan. The computed
 * lookup also keeps the value a runtime binding instead of a build-time
 * constant.
 */
function readBackend(): string {
  const value = process.env["DATA_BACKEND"];
  return (value ?? "").trim().toLowerCase();
}

export function activeDataBackend(): DataBackend {
  return readBackend() === "d1" ? "d1" : "supabase";
}

export function isD1Backend(): boolean {
  return activeDataBackend() === "d1";
}
