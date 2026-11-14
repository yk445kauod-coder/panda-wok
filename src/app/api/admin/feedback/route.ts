import type { NextRequest } from "next/server";
import { adminJson } from "@/lib/admin/api";
import { countFeedbackAdmin, listFeedbackAdmin } from "@/lib/services/admin-catalog";
import { DEFAULT_PAGE_SIZE, resolvePage } from "@/components/ui/pagination";
import type { Database } from "@/lib/types/database";

type FeedbackStatus = Database["public"]["Enums"]["feedback_status"];
type FeedbackCategory = Database["public"]["Enums"]["feedback_category"];

const STATUSES: FeedbackStatus[] = ["new", "reviewed", "responded", "resolved", "archived"];
const CATEGORIES: FeedbackCategory[] = ["food_quality", "delivery", "service", "overall", "other"];

/** Feedback inbox: a page of messages plus the filtered total. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawStatus = params.get("status");
  const rawCategory = params.get("category");
  const status = STATUSES.includes(rawStatus as FeedbackStatus)
    ? (rawStatus as FeedbackStatus)
    : undefined;
  const category = CATEGORIES.includes(rawCategory as FeedbackCategory)
    ? (rawCategory as FeedbackCategory)
    : undefined;
  const page = resolvePage(params.get("page") ?? undefined);
  const q = params.get("q") ?? undefined;
  const filter = { status, category, search: q };

  return adminJson("feedback.manage", async () => {
    const [feedback, total] = await Promise.all([
      listFeedbackAdmin({ ...filter, limit: DEFAULT_PAGE_SIZE, offset: (page - 1) * DEFAULT_PAGE_SIZE }),
      countFeedbackAdmin(filter),
    ]);
    return { feedback, total, page, pageSize: DEFAULT_PAGE_SIZE, status, category, q };
  });
}
