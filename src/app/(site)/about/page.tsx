import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings, getRestaurant } from "@/lib/services/catalog";
import { breadcrumbSchema, organisationSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Badge } from "@/components/ui/button";

export const dynamic = "force-dynamic";


export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  return buildMetadata({
    title: `About ${settings.brand.name}`,
    description: `The story behind ${settings.brand.name}, an Asian cloud kitchen cooking wok, ramen and sushi to order in ${settings.brand.city}, ${settings.brand.country}.`,
    path: "/about",
    siteName: settings.brand.name,
  });
}

export default async function AboutPage() {
  const [settings, restaurant] = await Promise.all([
    getPublicSettings(),
    getRestaurant(),
  ]);

  const brand = restaurant?.name_en ?? settings.brand.name;
  const description =
    restaurant?.description_en ??
    `${brand} is an Asian-inspired cloud kitchen in ${settings.brand.city}, cooking wok, ramen and izakaya plates to order.`;

  const cuisine = (restaurant?.cuisine_tags ?? []).filter(
    (tag): tag is string => typeof tag === "string",
  );

  const structured = [
    organisationSchema({
      name: brand,
      social: settings.support.social,
    }),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "About", path: "/about" },
    ]),
  ];

  return (
    <article className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ]}
      />

      <header className="mt-4 flex items-start gap-4">
        <BrandLogo brand={settings.brand} className="mt-1 size-14 shrink-0" />
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
            About {brand}
          </h1>
          <p className="mt-1.5 text-sm text-ink-700/85">
            {restaurant?.tagline_en ?? settings.brand.tagline}
          </p>
          {cuisine.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {cuisine.map((tag) => (
                <li key={tag}>
                  <Badge tone="plum">{tag}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <section className="prose-panda mt-6 space-y-4 text-sm leading-relaxed text-ink-800">
        <p>{description}</p>

        <h2 className="font-display text-lg font-semibold text-ink-900">
          A cloud kitchen, not a dining room
        </h2>
        <p>
          We cook in a dedicated kitchen and send everything straight to you. That means
          no tables, no queues and no waiting room — just food made when you order it, and
          a smaller operation that can pay attention to detail.
        </p>

        <h2 className="font-display text-lg font-semibold text-ink-900">
          How we cook
        </h2>
        <p>
          Wok dishes are cooked over high heat to order, broth is made ahead and held
          hot, and sushi is rolled as the order comes in. Nothing sits under a lamp
          waiting to be chosen. Because everything is made to order, our prep times are
          honest rather than instant, and a busy night affects everyone equally.
        </p>

        <h2 className="font-display text-lg font-semibold text-ink-900">
          Allergens and honest labelling
        </h2>
        <p>
          Every dish page lists the allergens the kitchen has recorded, along with
          vegetarian, vegan and spicy markers. That information is what we know about our
          own preparation; it is not a guarantee, because suppliers and shared equipment
          can introduce traces. If you have a serious allergy, please speak to us directly
          before ordering.
        </p>

        <h2 className="font-display text-lg font-semibold text-ink-900">
          Where we are
        </h2>
        <p>
          We cook in {restaurant?.area ? `${restaurant.area}, ` : ""}
          {restaurant?.city ?? settings.brand.city},{" "}
          {restaurant?.country ?? settings.brand.country}, and deliver across the city.
          Delivery fees, minimums and typical timings are listed on each order as you
          check out, and they are set by the kitchen rather than fixed in the code.
        </p>
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/menu"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-plum-600 px-6 font-medium text-rice-50 hover:bg-plum-700 sm:flex-1"
        >
          See the menu
        </Link>
        <Link
          href="/contact"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-ink-900/15 px-6 font-medium text-ink-900 hover:bg-rice-200 sm:flex-1"
        >
          Contact us
        </Link>
      </div>

      <JsonLdScript data={structured} />
    </article>
  );
}
