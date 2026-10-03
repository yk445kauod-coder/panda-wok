import type { PublicSettings } from "@/lib/services/catalog";
import { BRAND_LOGO_URL } from "@/lib/brand";

/**
 * Brand lock-up. When an admin has configured `brand.logo_url` (menu CMS /
 * Settings → brand), their uploaded logo is shown everywhere the brand appears:
 * navbar, footer, about, auth, favicon sources and OG image. Otherwise the
 * business's real logo asset is used — never a placeholder drawing.
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
  const src = brand.logo_url?.trim() || BRAND_LOGO_URL;

  return (
    <img
      src={src}
      alt={`${brand.name} logo`}
      decoding="async"
      className={`object-contain ${className ?? "size-9"}`}
    />
  );
}