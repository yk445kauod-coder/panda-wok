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
import { formatDateTime, humanise } from "@/lib/utils/format";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  return buildMetadata({
    title: `Feedback`,
    description: `Tell ${settings.brand.name} how your order went — good or bad.`,
    path: "/feedback",
    siteName: settings.brand.name,
  });
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const [{ order }, session, flags] = await Promise.all([
    searchParams,
    getSession(),
    getFeatureFlagMap(),
  ]);

  if (flags.feedback === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title="Feedback is switched off"
          description="We are not collecting feedback at the moment. Please contact the kitchen directly."
          action={
            <Link href="/contact" className="text-sm font-medium text-plum-600">
              Contact the kitchen
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
          { name: "Home", path: "/" },
          { name: "Feedback", path: "/feedback" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">Feedback</h1>
        <p className="mt-1.5 text-sm text-ink-700/85">
          We are a small kitchen and we read everything. Tell us what worked and what did
          not.
        </p>
      </header>

      {!session ? (
        <section className="washi-panel mt-5 p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Sign in to send feedback
          </h2>
          <p className="mt-1.5 text-sm text-ink-700/85">
            We ask you to sign in so we can tie your feedback to your order and reply to
            you directly. It also stops anonymous spam from burying real messages.
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/auth/sign-in?next=%2Ffeedback"
              className="inline-flex h-11 items-center rounded-xl bg-plum-600 px-5 text-sm font-medium text-rice-50 hover:bg-plum-700"
            >
              Sign in
            </Link>
            <Link
              href="/auth/sign-up?next=%2Ffeedback"
              className="inline-flex h-11 items-center rounded-xl border border-ink-900/15 px-5 text-sm font-medium text-ink-900 hover:bg-rice-200"
            >
              Create an account
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-700/70">
            Prefer not to sign in? Call or message us instead — details are on the{" "}
            <Link href="/contact" className="font-medium text-plum-600">
              contact page
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
              Feedback you have sent
            </h2>
            {previous.length === 0 ? (
              <EmptyState
                className="mt-3"
                title="Nothing sent yet"
                description="Anything you send will appear here with the kitchen's reply once we have read it."
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
                        <span className="sr-only">{entry.rating} out of 5</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.status === "resolved" ? (
                          <Badge tone="success">Resolved</Badge>
                        ) : (
                          <Badge tone="warning">Awaiting reply</Badge>
                        )}
                        <span className="text-xs text-ink-700/65">
                          {formatDateTime(entry.created_at)}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs uppercase tracking-wide text-ink-700/60">
                      {humanise(entry.category)}
                      {entry.title ? ` · ${entry.title}` : ""}
                    </p>
                    <p className="mt-1.5 text-sm text-ink-800">{entry.message}</p>

                    {entry.admin_response ? (
                      <div className="mt-3 rounded-xl border-l-2 border-plum-600 bg-rice-200/60 p-3">
                        <p className="text-xs font-medium text-plum-600">
                          Reply from the kitchen
                        </p>
                        <p className="mt-1 text-sm text-ink-800">
                          {entry.admin_response}
                        </p>
                      </div>
                    ) : null}

                    {entry.order_id ? (
                      <Link
                        href={`/orders/${entry.order_id}`}
                        className="mt-3 inline-block text-xs font-medium text-plum-600 hover:text-plum-700"
                      >
                        View the order
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
          { name: "Home", path: "/" },
          { name: "Feedback", path: "/feedback" },
        ])]}
      />
    </div>
  );
}
