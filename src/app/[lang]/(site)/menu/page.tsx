import { Suspense } from "react";
import type { Metadata } from "next";
import { MenuPage } from "@/components/customer/menu-page";
import { buildMetadata } from "@/lib/seo/metadata";
import { getRestaurant } from "@/lib/services/catalog";
import { localePath } from "@/lib/i18n/config";
import { staticLocale, staticT } from "@/lib/i18n/static";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = staticLocale(lang);
  const t = staticT(locale);
  const restaurant = await getRestaurant();
  const brand = restaurant?.name_en ?? "Panda Wok";
  return buildMetadata({
    title: t("menu.metaTitle", { brand }),
    description: t("menu.metaDescription", {
      brand,
      currency: "EGP",
      city: restaurant?.city ?? "Alexandria",
    }),
    path: localePath(locale, "/menu"),
    keywords:
      locale === "ar"
        ? ["قائمة باندا ووك", "مطبخ سحابي الإسكندرية", "توصيل طعام الإسكندرية"]
        : ["Panda Wok menu", "cloud kitchen Alexandria", "food delivery Alexandria"],
    siteName: brand,
    locale,
  });
}

/**
 * The menu is a static shell.
 *
 * It used to await the whole catalogue on the Worker, so each visit rendered 90
 * dishes server-side. `MenuPage` is a client component that reads the catalogue
 * from the client store, so this document is a constant and the Worker pays
 * nothing to serve it. `generateMetadata` runs at build time (the route is
 * prerendered), so reading the restaurant row there costs nothing per request.
 */
export default function Page() {
  return (
    <Suspense>
      <MenuPage />
    </Suspense>
  );
}
