import { Suspense } from "react";
import { CrmSegmentsPage } from "@/components/admin/pages/crm-segments";

export default function Page() {
  return (
    <Suspense>
      <CrmSegmentsPage />
    </Suspense>
  );
}
