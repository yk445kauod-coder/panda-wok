import type { PublicSettings } from "@/lib/services/catalog";

/**
 * Brand lock-up. When an admin has configured `brand.logo_url` (menu CMS /
 * Settings → brand), their uploaded logo is shown everywhere the brand appears:
 * footer, about, auth, favicon sources and OG image. Fallback is the built-in
 * hand-inked panda mark, so the site never shows a broken image.
 */
export function BrandLogo({
  brand,
  className,
}: {
  brand: Pick<
    PublicSettings["brand"],
    "name" | "logo_url"
  >;
  className?: string;
}) {
  if (brand.logo_url) {
    return (
      <img
        src={brand.logo_url}
        alt={`${brand.name} logo`}
        className={`object-contain ${className ?? "size-9"}`}
        loading="lazy"
      />
    );
  }

  return (
    <img
      src="/icon.svg"
      alt={`${brand.name} logo`}
      className={`object-contain ${className ?? "size-9"}`}
    />
  );
}