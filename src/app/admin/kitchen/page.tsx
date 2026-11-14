import { Suspense } from "react";
import { KitchenPage } from "@/components/admin/pages/kitchen";

export default function Page() {
  return (
    <Suspense>
      <KitchenPage />
    </Suspense>
  );
}
