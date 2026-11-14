import { Suspense } from "react";
import { AnalyticsPage } from "@/components/admin/pages/analytics";

export default function Page() {
  return (
    <Suspense>
      <AnalyticsPage />
    </Suspense>
  );
}
