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
import { serverEnv } from "@/lib/config/env";

export type DataBackend = "supabase" | "d1";

export function activeDataBackend(): DataBackend {
  // Read through the computed lookup the rest of the server config uses, so the
  // value stays a runtime binding rather than a build-time constant.
  let raw = "";
  try {
    raw = (serverEnv.DATA_BACKEND ?? "").trim().toLowerCase();
  } catch {
    raw = "";
  }
  return raw === "d1" ? "d1" : "supabase";
}

export function isD1Backend(): boolean {
  return activeDataBackend() === "d1";
}
