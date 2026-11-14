import { adminJson } from "@/lib/admin/api";
import {
  getTagCounts,
  listCustomerTags,
  segmentOverview,
  SEGMENT_VALUE_LABELS,
} from "@/lib/crm/customers";

/** Live audience counts and the tag census for the segments view. */
export async function GET() {
  return adminJson("crm.view", async () => {
    const [segments, tags, tagCounts] = await Promise.all([
      segmentOverview(),
      listCustomerTags().catch(() => []),
      getTagCounts().catch(() => ({}) as Record<string, number>),
    ]);
    return { segments, tags, tagCounts, valueLabels: SEGMENT_VALUE_LABELS };
  });
}
