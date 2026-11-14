import { Suspense } from "react";
import { OrdersListPage } from "@/components/admin/pages/orders-list";

export default function Page() {
  return (
    <Suspense>
      <OrdersListPage />
    </Suspense>
  );
}
