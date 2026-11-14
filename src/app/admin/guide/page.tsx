import type { Metadata } from "next";
import { GuidePage } from "@/components/admin/pages/guide";

export const metadata: Metadata = {
  title: "Guide",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <GuidePage />;
}
