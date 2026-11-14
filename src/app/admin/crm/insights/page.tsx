import { Suspense } from "react";
import { CrmInsightsPage } from "@/components/admin/pages/crm-insights";

export default function Page() {
  return (
    <Suspense>
      <CrmInsightsPage />
    </Suspense>
  );
}
