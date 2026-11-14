import type { Metadata } from "next";
import { DeniedPage } from "@/components/admin/pages/denied";

export const metadata: Metadata = {
  title: "Access denied",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DeniedPage />;
}
