import { Suspense } from "react";
import { OffersPage } from "@/components/admin/pages/offers";

export default function Page() {
  return (
    <Suspense>
      <OffersPage />
    </Suspense>
  );
}
