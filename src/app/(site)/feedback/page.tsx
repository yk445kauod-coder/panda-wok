import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { getMyOrders } from "@/lib/services/orders";
import { getMyFeedback } from "@/lib/services/loyalty";
import { getFeatureFlagMap, getPublicSettings } from "@/lib/services/catalog";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { FeedbackForm } from "@/components/customer/feedback-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils/format";
import { getLocale, getT } from "@/lib/i18n/server";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const [locale, settings] = await Promise.all([getLocale(), getPublicSettings()]);
  const t = await getT(locale);
  return buildMetadata({
    title: t("feedback.metaTitle"),
    description: t("feedback.metaDescription", { brand: settings.brand.name }),
    path: "/feedback",
    siteName: settings.brand.name,
    locale,
  });
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const [{ order }, session, flags, locale] = await Promise.all([
    searchParams,
    getSession(),
    getFeatureFlagMap(),
    getLocale(),
  ]);
  const t = await getT(locale);

  if (flags.feedback === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title={t("feedback.offTitle")}
          description={t("feedback.offBody")}
          action={
            <Link href="/contact" className="text-sm font-medium text-plum-600">
              {t("common.contactKitchen")}
            </Link>
          }
        />
      </div>
    );
  }

  const [orders, previous] = session
    ? await Promise.all([
        getMyOrders(session.user.id, 10),
        getMyFeedback(session.user.id),
      ])
    : [[], []];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("common.home"), path: "/" },
          { name: t("common.feedback"), path: "/feedback" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
          {t("feedback.title")}
        </h1>
        <p className="mt-1.5 text-sm text-ink-700/85">{t("feedback.subtitle")}</p>
      </header>

      {!session ? (
        <section className="washi-panel mt-5 p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            {t("feedback.signInTitle")}
          </h2>
          <p className="mt-1.5 text-sm text-ink-700/85">{t("feedback.signInBody")}</p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/auth/sign-in?next=%2Ffeedback"
              className="inline-flex h-11 items-center rounded-xl bg-plum-600 px-5 text-sm font-medium text-rice-50 hover:bg-plum-700"
            >
              {t("feedback.signInCta")}
            </Link>
            <Link
              href="/auth/sign-up?next=%2Ffeedback"
              className="inline-flex h-11 items-center rounded-xl border border-ink-900/15 px-5 text-sm font-medium text-ink-900 hover:bg-rice-200"
            >
              {t("feedback.signUpCta")}
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-700/70">
            {t("feedback.preferNot")}
            <Link href="/contact" className="font-medium text-plum-600">
              {t("feedback.contactPage")}
            </Link>
            .
          </p>
        </section>
      ) : (
        <>
          <FeedbackForm
            orders={orders.map((o) => ({ id: o.id, orderNumber: o.order_number }))}
            defaultOrderId={order}
          />

          <section aria-labelledby="previous-heading" className="mt-6">
            <h2 id="previous-heading" className="text-lg font-semibold text-ink-900">
              {t("feedback.previousHeading")}
            </h2>
            {previous.length === 0 ? (
              <EmptyState
                className="mt-3"
                title={t("feedback.nothingSentTitle")}
                description={t("feedback.nothingSentBody")}
              />
            ) : (
              <ul className="mt-3 space-y-3">
                {previous.map((entry) => (
                  <li key={entry.id} className="washi-panel p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <Star
                            key={value}
                            className={
                              value <= entry.rating
                                ? "size-4 fill-miso-500 text-miso-500"
                                : "size-4 text-ink-900/20"
                            }
                            aria-hidden="true"
                          />
                        ))}
                        <span className="sr-only">
                          {t("feedback.ratingAria", { value: entry.rating })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.status === "resolved" ? (
                          <Badge tone="success">{t("feedback.resolved")}</Badge>
                        ) : (
                          <Badge tone="warning">{t("feedback.awaitingReply")}</Badge>
                        )}
                        <span className="text-xs text-ink-700/65">
                          {formatDateTime(entry.created_at, locale)}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs uppercase tracking-wide text-ink-700/60">
                      {t(`feedback.categories.${entry.category}`)}
                      {entry.title ? ` · ${entry.title}` : ""}
                    </p>
                    <p className="mt-1.5 text-sm text-ink-800">{entry.message}</p>

                    {entry.admin_response ? (
                      <div className="mt-3 rounded-xl border-s-2 border-plum-600 bg-rice-200/60 p-3">
                        <p className="text-xs font-medium text-plum-600">
                          {t("feedback.replyFromKitchen")}
                        </p>
                        <p className="mt-1 text-sm text-ink-800">{entry.admin_response}</p>
                      </div>
                    ) : null}

                    {entry.order_id ? (
                      <Link
                        href={`/orders/${entry.order_id}`}
                        className="mt-3 inline-block text-xs font-medium text-plum-600 hover:text-plum-700"
                      >
                        {t("feedback.viewOrder")}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <JsonLdScript
        data={[breadcrumbSchema([
          { name: t("common.home"), path: "/" },
          { name: t("common.feedback"), path: "/feedback" },
        ])]}
      />
    </div>
  );
}