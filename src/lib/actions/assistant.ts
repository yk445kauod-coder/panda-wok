"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { assistantSchema } from "@/lib/validation/schemas";
import { actionOk, type ActionResult } from "@/lib/actions/result";
import { answerAssistantQuestion } from "@/lib/ai/assistant";
import { checkAssistantRateLimit, getPromptInstruction } from "@/lib/ai/guard";
import { recordAiRequest } from "@/lib/ai/usage";
import { logActivity } from "@/lib/activity/log";

const FALLBACK_INSTRUCTION = `You are the Panda Wok menu assistant for a cloud kitchen in Alexandria, Egypt.

Rules you must follow without exception:
1. Use ONLY the DATA block provided in the user message. It is the live database contents.
2. Never invent, guess or embellish a dish, price, ingredient, allergen or restaurant detail that is not in the DATA block.
3. If the DATA block does not contain the answer, say you do not have that information and suggest contacting the kitchen.
4. Never claim a dish is available if the DATA block marks it unavailable.
5. For allergy or medical questions, state clearly that the listed allergen data is not a guarantee and the customer must confirm with the kitchen.
6. Be warm, concise and helpful. Reply in the language the customer used (English or Arabic).
7. Prefer short paragraphs over long lists, and mention prices in EGP.
8. Do not take orders, accept payments or promise delivery times beyond the stated estimate.`;

export type AssistantReply = {
  answer: string;
  provider: string;
  model: string;
  status: "ok" | "fallback";
};

/**
 * Answers a customer question about the menu. The model receives a single
 * grounded DATA block; without a configured provider the deterministic
 * renderer answers from the same block, so the assistant is always available
 * and never fabricates.
 */
export async function askAssistantAction(
  input: unknown,
): Promise<ActionResult<AssistantReply>> {
  const parsed = assistantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: parsed.error.issues[0]?.message ?? "Please rephrase your question.",
      },
    };
  }

  const session = await getSession();
  const userId = session?.user.id ?? null;

  const limit = await checkAssistantRateLimit(userId);
  if (!limit.allowed) {
    return {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message:
          "You have reached today's limit for the assistant. Please try again tomorrow or contact the kitchen directly.",
      },
    };
  }

  const prompt = await getPromptInstruction("assistant.menu", FALLBACK_INSTRUCTION);

  try {
    const { result } = await answerAssistantQuestion({
      question: parsed.data.question,
      history: parsed.data.history,
      systemInstruction: prompt.instruction,
    });

    await recordAiRequest({
      userId,
      surface: "assistant",
      promptKey: "assistant.menu",
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      promptTokens: null,
      completionTokens: null,
      estimatedCost: 0,
      status: result.status,
      error: result.error,
    });

    if (userId) {
      const supabase = await createServerSupabase();
      await logActivity(supabase, {
        userId,
        event: "ASSISTANT_USED",
        entity: "ai_requests",
        metadata: { provider: result.provider, status: result.status },
      });
    }

    return actionOk({
      answer: result.answer,
      provider: result.provider,
      model: result.model,
      status: result.status,
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message:
          error instanceof Error && /not configured/i.test(error.message)
            ? "The assistant is not available right now. Please browse the menu or contact the kitchen."
            : "The assistant could not answer that. Please try again.",
      },
    };
  }
}
