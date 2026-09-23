import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MapPin, MessageCircle, Phone, Store } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings, getRestaurant } from "@/lib/services/catalog";
import { breadcrumbSchema, restaurantSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";

export const dynamic = "force-dynamic";


export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  return buildMetadata({
    title: `Contact ${settings.brand.name}`,
    description: `Reach ${settings.brand.name} in ${settings.brand.city} to ask about an order, an allergen or delivery to your area.`,
    path: "/contact",
    siteName: settings.brand.name,
  });
}

const DAY_LABELS: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * Contact details come from the settings table, so the kitchen can change a
 * phone number without a deploy. Nothing here is invented: when a value is
 * missing we say so instead of showing a placeholder.
 */
export default async function ContactPage() {
  const [settings, restaurant] = await Promise.all([
    getPublicSettings(),
    getRestaurant(),
  ]);

  const brand = restaurant?.name_en ?? settings.brand.name;
  const { phone, whatsapp, email, social, openingHours } = settings.support;

  const hoursEntries = Object.entries(
    (openingHours ?? {}) as Record<string, unknown>,
  ).filter(([, value]) => typeof value === "string" && value.trim());

  const socialEntries = Object.entries(social);

  const hasAnyChannel =
    Boolean(phone) || Boolean(whatsapp) || Boolean(email) || socialEntries.length > 0;

  const structured = [
    restaurantSchema({
      name: brand,
      description: restaurant?.description_en ?? null,
      tagline: restaurant?.tagline_en ?? null,
      cuisineTags: restaurant?.cuisine_tags ?? [],
      city: restaurant?.city ?? settings.brand.city,
      country: restaurant?.country ?? settings.brand.country,
      area: restaurant?.area ?? null,
      latitude: restaurant?.latitude ?? null,
      longitude: restaurant?.longitude ?? null,
      phone,
      email,
      social,
      openingHours: (openingHours ?? {}) as Record<string, unknown>,
      currency: restaurant?.currency ?? "EGP",
    }),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Contact", path: "/contact" },
    ]),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
          Contact {brand}
        </h1>
        <p className="mt-1.5 text-sm text-ink-700/85">
          Questions about an order, an allergen or delivery to your area — reach us
          directly. We are a small kitchen, so a phone call usually gets the fastest
          answer.
        </p>
      </header>

      {!hasAnyChannel ? (
        <p className="mt-5 rounded-xl border border-miso-500/30 bg-miso-300/15 p-4 text-sm text-ink-800">
          Our contact details are being updated. Please check back shortly, or use the
          assistant if you have a question about the menu.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {phone ? (
            <ContactRow
              icon={Phone}
              label="Phone"
              value={phone}
              href={`tel:${phone.replace(/\s+/g, "")}`}
              note="Best for order changes and urgent questions."
            />
          ) : null}

          {whatsapp ? (
            <ContactRow
              icon={MessageCircle}
              label="WhatsApp"
              value={whatsapp}
              href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}`}
              note="Send us a message and a photo of your location if helpful."
              external
            />
          ) : null}

          {email ? (
            <ContactRow
              icon={Mail}
              label="Email"
              value={email}
              href={`mailto:${email}`}
              note="Good for feedback or anything that is not urgent."
            />
          ) : null}

          {socialEntries.map(([key, url]) => (
            <ContactRow
              key={key}
              icon={Store}
              label={key.charAt(0).toUpperCase() + key.slice(1)}
              value={url.replace(/^https?:\/\//, "")}
              href={url}
              note="Follow us for new dishes and announcements."
              external
            />
          ))}
        </ul>
      )}

      <section aria-labelledby="hours-heading" className="washi-panel mt-5 p-4">
        <h2
          id="hours-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
        >
          <Clock className="size-4 text-plum-600" aria-hidden="true" />
          Opening hours
        </h2>
        {hoursEntries.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700/80">
            Our opening hours are being confirmed. Please call before ordering outside
            usual mealtimes.
          </p>
        ) : (
          <dl className="mt-3 space-y-1.5 text-sm">
            {hoursEntries.map(([day, value]) => (
              <div key={day} className="flex justify-between gap-3">
                <dt className="text-ink-700/85">
                  {DAY_LABELS[day.toLowerCase()] ?? day}
                </dt>
                <dd className="tabular-nums text-ink-900">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section aria-labelledby="area-heading" className="washi-panel mt-3 p-4">
        <h2
          id="area-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
        >
          <MapPin className="size-4 text-plum-600" aria-hidden="true" />
          Where we cook
        </h2>
        <p className="mt-2 text-sm text-ink-700/85">
          {restaurant?.area ? `${restaurant.area}, ` : ""}
          {restaurant?.city ?? settings.brand.city},{" "}
          {restaurant?.country ?? settings.brand.country}
        </p>
        <p className="mt-1 text-xs text-ink-700/70">
          We are a cloud kitchen rather than a restaurant, so there is no dining room to
          visit. Collection is available at checkout if you prefer to pick your order up.
        </p>
      </section>

      <section aria-labelledby="ordering-heading" className="washi-panel mt-3 p-4">
        <h2 id="ordering-heading" className="text-sm font-semibold text-ink-900">
          Ordering and delivery
        </h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-700/85">Minimum order</dt>
            <dd className="tabular-nums text-ink-900">
              {settings.ordering.minOrderTotal} EGP
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-700/85">Delivery fee</dt>
            <dd className="tabular-nums text-ink-900">{settings.ordering.deliveryFee} EGP</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-700/85">Free delivery over</dt>
            <dd className="tabular-nums text-ink-900">
              {settings.ordering.freeDeliveryOver} EGP
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-700/85">Typical delivery time</dt>
            <dd className="tabular-nums text-ink-900">
              about {settings.ordering.etaMinutes} minutes
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-ink-700/70">
          Timings are a guide rather than a promise, and depend on how busy the kitchen is.
        </p>
      </section>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/menu"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-plum-600 px-6 font-medium text-rice-50 hover:bg-plum-700 sm:flex-1"
        >
          Start an order
        </Link>
        <Link
          href="/feedback"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-ink-900/15 px-6 font-medium text-ink-900 hover:bg-rice-200 sm:flex-1"
        >
          Send feedback
        </Link>
      </div>

      <JsonLdScript data={structured} />
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
  note,
  external,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href: string;
  note: string;
  external?: boolean;
}) {
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="washi-panel flex items-start gap-3 p-4 transition-shadow hover:shadow-washi-lg"
      >
        <Icon className="mt-0.5 size-5 shrink-0 text-plum-600" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-xs font-medium uppercase tracking-wide text-ink-700/70">
            {label}
          </span>
          <span className="mt-0.5 block break-words text-sm font-medium text-ink-900">
            {value}
          </span>
          <span className="mt-1 block text-xs text-ink-700/75">{note}</span>
        </span>
      </a>
    </li>
  );
}
