"use client";

import dynamic from "next/dynamic";

/**
 * The two customer-widgets whose file cost is heavy (motion + sprite) are
 * mounted here, in a client component, so `ssr: false` is legal and means
 * their bundles never appear in the SSR HTML — the browser downloads them
 * only after the page is interactive (lazy hydration with a null placeholder).
 * The outer layout stays a server component and keeps zero widget JS.
 */
const PandaAssistantClient = dynamic(
  () => import("@/components/panda/assistant").then((m) => m.PandaAssistant),
  { ssr: false, loading: () => null },
);
const FloatingPandaClient = dynamic(
  () => import("@/components/layout/floating-panda").then((m) => m.FloatingPanda),
  { ssr: false, loading: () => null },
);

export function SiteWidgets({ brandName, disclosure }: { brandName: string; disclosure: string }) {
  return (
    <>
      <PandaAssistantClient brandName={brandName} disclosure={disclosure} />
      <FloatingPandaClient />
    </>
  );
}