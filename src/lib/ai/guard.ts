import "server-only";

import { tryCreateAdminSupabase, createServerSupabase } from "@/lib/supabase/server";

/**
 * Daily rate limit for the public assistant. Counted from ai_requests rather
 * than an in-memory store so it survives across serverless instances.
 */
const DAILY_LIMIT_PER_USER = 60;

export async function checkAssistantRateLimit(
  userId: string | null,
): Promise<{ allowed: boolean; remaining: number }> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { allowed: true, remaining: DAILY_LIMIT_PER_USER };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let query = admin
    .from("ai_requests")
    .select("id", { count: "exact", head: true })
    .eq("surface", "assistant")
    .gte("created_at", since);

  query = userId ? query.eq("user_id", userId) : query.is("user_id", null);

  const { count } = await query;
  const used = count ?? 0;

  return {
    allowed: used < DAILY_LIMIT_PER_USER,
    remaining: Math.max(0, DAILY_LIMIT_PER_USER - used),
  };
}

/**
 * Loads the active system instruction from the admin-managed prompt table so
 * operators can tune assistant behaviour without a deploy.
 */
export async function getPromptInstruction(
  key: string,
  fallback: string,
): Promise<{ instruction: string; temperature: number; maxTokens: number }> {
  const supabase = await createServerSupabase();

  // ai_prompts is admin-only under RLS, so a customer request falls back here.
  const { data } = await supabase
    .from("ai_prompts")
    .select("system_instruction, temperature, max_tokens, is_active")
    .eq("key", key)
    .maybeSingle();

  if (data?.is_active && data.system_instruction) {
    return {
      instruction: data.system_instruction,
      temperature: Number(data.temperature),
      maxTokens: data.max_tokens,
    };
  }

  const admin = tryCreateAdminSupabase();
  if (admin) {
    const { data: privileged } = await admin
      .from("ai_prompts")
      .select("system_instruction, temperature, max_tokens, is_active")
      .eq("key", key)
      .maybeSingle();
    if (privileged?.is_active && privileged.system_instruction) {
      return {
        instruction: privileged.system_instruction,
        temperature: Number(privileged.temperature),
        maxTokens: privileged.max_tokens,
      };
    }
  }

  return { instruction: fallback, temperature: 0.2, maxTokens: 500 };
}
