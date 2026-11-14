import type { NextRequest } from "next/server";
import { adminJson } from "@/lib/admin/api";
import { listActivity } from "@/lib/crm/customers";

/** The recorded-activity feed, filterable by event and free-text search. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const event = params.get("event") ?? undefined;
  const q = params.get("q") ?? undefined;
  return adminJson("crm.view", async () => {
    const events = await listActivity({ event, search: q, limit: 200 });
    return { events };
  });
}
