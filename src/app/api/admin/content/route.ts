import { adminJson } from "@/lib/admin/api";
import {
  listAnnouncements,
  listFaqs,
  listDeliveryZones,
  listPageContent,
} from "@/lib/services/admin-catalog";
import { contentTablesReady } from "@/lib/actions/content-health";

/** Page copy, FAQs, delivery zones and announcements, for the content editor. */
export async function GET() {
  return adminJson("settings.manage", async () => {
    const ready = await contentTablesReady();
    if (!ready) {
      return { ready: false, sections: [], faqs: [], zones: [], announcements: [] };
    }
    const [sections, faqs, zones, announcements] = await Promise.all([
      listPageContent(),
      listFaqs(),
      listDeliveryZones(),
      listAnnouncements(),
    ]);
    return { ready: true, sections, faqs, zones, announcements };
  });
}
