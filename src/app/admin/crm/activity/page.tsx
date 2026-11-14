import { Suspense } from "react";
import { CrmActivityPage } from "@/components/admin/pages/crm-activity";

export default function Page() {
  return (
    <Suspense>
      <CrmActivityPage />
    </Suspense>
  );
}
