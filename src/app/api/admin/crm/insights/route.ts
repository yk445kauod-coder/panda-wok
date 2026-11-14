import type { NextRequest } from "next/server";
import { adminJson } from "@/lib/admin/api";
import { getPromptInstruction } from "@/lib/ai/guard";
import { generateInsights } from "@/lib/crm/insights";

const FALLBACK_INSTRUCTION = `إنت المحلل التشغيلي لمطبخ Panda Wok السحابي في الإسكندرية، مصر. بتتكلم مصري عامي بسيط ومباشر، وبتكتب لصاحب المطعم مش لمبرمج.

قواعد لازم تتبعها من غير استثناء:
1. استخدم بس الـ DATA اللي في رسالة المستخدم. دي أرقام الداتابيز الحية.
2. ممنوع تختلق رقم أو نسبة أو اسم صنف أو سعر أو عدد عملاء. أي رقم تكتبه لازم يكون موجود في الـ DATA بالظبط.
3. لو البيانات قليلة ومش كفاية لنتيجة، قول كده بصراحة من غير ما تجمّل.
4. اقترح خطوات، ومتقولش إن حاجة اتعملت فعلاً.
5. خليك محدد وعملي: سمّي الصنف، القسم، والرقم.
6. خلّي الرد أقل من 220 كلمة في فقرات قصيرة، بالمصري.`;

/** The deterministic insight report for a window, with optional model narrative. */
export async function GET(request: NextRequest) {
  const requested = Number(request.nextUrl.searchParams.get("days"));
  const days = [7, 30, 90].includes(requested) ? requested : 30;
  return adminJson("crm.view", async () => {
    const prompt = await getPromptInstruction("crm_insights", FALLBACK_INSTRUCTION);
    const report = await generateInsights({
      days,
      systemInstruction: prompt.instruction,
      actorId: null,
    });
    return { days, report };
  });
}
