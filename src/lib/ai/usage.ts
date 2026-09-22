import "server-only";

import { tryCreateAdminSupabase } from "@/lib/supabase/server";

/**
 * Records one AI call for the admin AI-usage dashboard. Uses the service role
 * because customers must not be able to write or read these rows. Failure is
 * non-fatal: an unanswered usage metric must never break the assistant.
 */
export async function recordAiRequest(params: {
  userId: string | null;
  surface: "assistant" | "crm_insights";
  promptKey: string;
  provider: string;
  model: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  estimatedCost: number | null;
  status: "ok" | "fallback" | "error" | "rate_limited";
  error: string | null;
}): Promise<void> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return;

  try {
    await admin.from("ai_requests").insert({
      user_id: params.userId,
      surface: params.surface,
      prompt_key: params.promptKey,
      provider: params.provider,
      model: params.model,
      latency_ms: params.latencyMs,
      prompt_tokens: params.promptTokens,
      completion_tokens: params.completionTokens,
      estimated_cost: params.estimatedCost,
      status: params.status,
      error: params.error ? params.error.slice(0, 500) : null,
    });

    const day = new Date().toISOString().slice(0, 10);
    const { data: existing } = await admin
      .from("ai_usage_daily")
      .select("requests, errors, prompt_tokens, completion_tokens, estimated_cost")
      .eq("day", day)
      .eq("provider", params.provider)
      .maybeSingle();

    await admin.from("ai_usage_daily").upsert(
      {
        day,
        provider: params.provider,
        requests: (existing?.requests ?? 0) + 1,
        errors:
          (existing?.errors ?? 0) + (params.status === "error" ? 1 : 0),
        prompt_tokens:
          (existing?.prompt_tokens ?? 0) + (params.promptTokens ?? 0),
        completion_tokens:
          (existing?.completion_tokens ?? 0) + (params.completionTokens ?? 0),
        estimated_cost:
          Number(existing?.estimated_cost ?? 0) +
          Number(params.estimatedCost ?? 0),
      },
      { onConflict: "day,provider" },
    );
  } catch {
    // Best effort by design.
  }
}
