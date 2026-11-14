import { Suspense } from "react";
import { CrmHomePage } from "@/components/admin/pages/crm-home";

export default function Page() {
  return (
    <Suspense>
      <CrmHomePage />
    </Suspense>
  );
}
