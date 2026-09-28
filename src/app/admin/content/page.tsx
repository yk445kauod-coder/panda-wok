import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import {
  listAnnouncements,
  listDeliveryZones,
  listFaqs,
  listPageContent,
} from "@/lib/services/admin-catalog";
import {
  AnnouncementForm,
  AnnouncementList,
  DeliveryZoneForm,
  DeliveryZoneList,
  FaqForm,
  FaqList,
  PageContentForm,
  PageContentList,
} from "@/components/admin/content-forms";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";
import { contentTablesReady } from "@/lib/actions/content-health";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Content CMS. Page copy, FAQs, delivery zones and announcements were code-only
 * before this; they are now data, so staff can edit the customer-facing site
 * without a deploy. Each table falls back cleanly when empty, so clearing a
 * section here is safe rather than breaking a page.
 */
export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string;
    faq?: string;
    zone?: string;
    announcement?: string;
  }>;
}) {
  await requireCapability("settings.manage");
  const t = await getT(await getAdminLocale());
  const params = await searchParams;

  const ready = await contentTablesReady();
  if (!ready) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-900">{t("admin.pages.content.title")}</h1>
        <EmptyState
          title={t("admin.pages.content.noTables")}
          description={t("admin.pages.content.noTablesBody")}
        />
      </div>
    );
  }

  const [sections, faqs, zones, announcements] = await Promise.all([
    listPageContent(),
    listFaqs(),
    listDeliveryZones(),
    listAnnouncements(),
  ]);

  const editingSection = params.section
    ? (sections.find((row) => row.id === params.section) ?? null)
    : null;
  const editingFaq = params.faq
    ? (faqs.find((row) => row.id === params.faq) ?? null)
    : null;
  const editingZone = params.zone
    ? (zones.find((row) => row.id === params.zone) ?? null)
    : null;
  const editingAnnouncement = params.announcement
    ? (announcements.find((row) => row.id === params.announcement) ?? null)
    : null;

  const editing = editingSection || editingFaq || editingZone || editingAnnouncement;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">{t("admin.pages.content.title")}</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("admin.pages.content.description")}
          </p>
        </div>
        {editing ? (
          <Link
            href="/admin/content"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            {t("admin.pages.content.new")}
          </Link>
        ) : null}
      </header>

      <p className="washi-panel p-3 text-sm text-ink-800">
        {t("admin.pages.content.notice")}
      </p>

      {/* ------------------------------------------------------- page copy */}
      <section aria-label="Page copy">
        <h2 className="mb-1 font-display text-lg font-semibold text-ink-900">
          Page copy{" "}
          <span className="text-sm font-normal text-ink-700/60">
            ({formatNumber(sections.length)})
          </span>
        </h2>
        <p className="mb-4 text-sm text-ink-700/80">
          Long-form sections keyed by page and section. The about page reads{" "}
          <code className="rounded bg-ink-900/8 px-1 py-0.5 text-xs">story</code>,{" "}
          <code className="rounded bg-ink-900/8 px-1 py-0.5 text-xs">how_we_cook</code>{" "}
          and{" "}
          <code className="rounded bg-ink-900/8 px-1 py-0.5 text-xs">allergens</code>;
          edit those to rewrite the page.
        </p>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="washi-panel p-4">
            <h3 className="font-display text-base font-semibold text-ink-900">
              {editingSection ? "Edit section" : "Add a section"}
            </h3>
            <div className="mt-4">
              <PageContentForm row={editingSection} />
            </div>
          </div>
          <div>
            {sections.length === 0 ? (
              <EmptyState
                title={t("admin.pages.content.noSections")}
                description={t("admin.pages.content.noSectionsBody")}
              />
            ) : (
              <PageContentList rows={sections} />
            )}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- FAQs */}
      <section aria-label="FAQs">
        <h2 className="mb-1 font-display text-lg font-semibold text-ink-900">
          FAQs{" "}
          <span className="text-sm font-normal text-ink-700/60">
            ({formatNumber(faqs.length)})
          </span>
        </h2>
        <p className="mb-4 text-sm text-ink-700/80">
          Published questions appear on the FAQ page and feed the assistant&apos;s
          answers.
        </p>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="washi-panel p-4">
            <h3 className="font-display text-base font-semibold text-ink-900">
              {editingFaq ? "Edit FAQ" : "Add an FAQ"}
            </h3>
            <div className="mt-4">
              <FaqForm row={editingFaq} />
            </div>
          </div>
          <div>
            {faqs.length === 0 ? (
              <EmptyState
                title={t("admin.pages.content.noFaqs")}
                description={t("admin.pages.content.noFaqsBody")}
              />
            ) : (
              <FaqList rows={faqs} />
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- delivery zones */}
      <section aria-label="Delivery zones">
        <h2 className="mb-1 font-display text-lg font-semibold text-ink-900">
          Delivery zones{" "}
          <span className="text-sm font-normal text-ink-700/60">
            ({formatNumber(zones.length)})
          </span>
        </h2>
        <p className="mb-4 text-sm text-ink-700/80">
          Fees and free-delivery thresholds per area. These describe the business; the
          checkout still reads its own rules from settings.
        </p>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="washi-panel p-4">
            <h3 className="font-display text-base font-semibold text-ink-900">
              {editingZone ? "Edit zone" : "Add a zone"}
            </h3>
            <div className="mt-4">
              <DeliveryZoneForm row={editingZone} />
            </div>
          </div>
          <div>
            {zones.length === 0 ? (
              <EmptyState
                title={t("admin.pages.content.noZones")}
                description={t("admin.pages.content.noZonesBody")}
              />
            ) : (
              <DeliveryZoneList rows={zones} />
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- announcements */}
      <section aria-label="Announcements">
        <h2 className="mb-1 font-display text-lg font-semibold text-ink-900">
          Announcements{" "}
          <span className="text-sm font-normal text-ink-700/60">
            ({formatNumber(announcements.length)})
          </span>
        </h2>
        <p className="mb-4 text-sm text-ink-700/80">
          Short banners for holidays and closures. Schedule a window and it appears and
          disappears on its own.
        </p>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="washi-panel p-4">
            <h3 className="font-display text-base font-semibold text-ink-900">
              {editingAnnouncement ? "Edit announcement" : "Add an announcement"}
            </h3>
            <div className="mt-4">
              <AnnouncementForm row={editingAnnouncement} />
            </div>
          </div>
          <div>
            {announcements.length === 0 ? (
              <EmptyState
                title={t("admin.pages.content.noAnnouncements")}
                description={t("admin.pages.content.noAnnouncementsBody")}
              />
            ) : (
              <AnnouncementList rows={announcements} />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
