"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

/**
 * The Meta (Facebook) Pixel base snippet, adapted from Meta's generated code.
 *
 * Two deliberate changes from the snippet Meta hands out:
 *  - the id is interpolated from settings (validated digits-only in the catalog
 *    loader), so the owner rotates it or turns tracking off without a deploy;
 *  - the `<noscript>` image is emitted as JSX rather than inside the script
 *    string, so React owns it and there is no `innerHTML` of remote markup.
 */
function baseSnippet(pixelId: string): string {
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`;
}

/**
 * Loads the Meta Pixel and records a PageView for every client-side navigation.
 *
 * The storefront is a single-page app: without the route effect only the first
 * landing page would ever be counted, so an ad click that lands on `/` and then
 * browses to `/menu` would look like one page view. The base snippet already
 * fires the initial PageView, so the effect skips the first run to avoid
 * double-counting the landing page.
 */
export function MetaPixel({ pixelId }: { pixelId: string | null }) {
  const pathname = usePathname();
  const firstPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pixelId) return;
    if (firstPath.current === null) {
      firstPath.current = pathname;
      return;
    }
    if (firstPath.current === pathname) return;
    firstPath.current = pathname;
    window.fbq?.("track", "PageView");
  }, [pixelId, pathname]);

  if (!pixelId) return null;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: baseSnippet(pixelId) }} />
      {/* Meta's own fallback for JS-off visitors. A plain <img> is the point: it
          has to be fetched by the browser as an image, so next/image is wrong here. */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}

/**
 * Fires a standard Meta event. A no-op until the pixel has loaded (or when
 * tracking is off), so callers never need to guard. Standard event names are
 * used where Meta defines one (`AddToCart`, `InitiateCheckout`, `Purchase`,
 * `CompleteRegistration`) so ad optimisation can target them directly.
 */
export function trackMeta(
  event: string,
  params: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", event, params);
}
