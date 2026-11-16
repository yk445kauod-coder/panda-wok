import { Suspense } from "react";
import { OrderTrackingPage } from "@/components/customer/order-tracking-page";

export const dynamic = "force-static";

/**
 * Static shell. The order id and the `placed` flag are read on the client, so
 * the shell wraps the page in Suspense (`useSearchParams` suspends) and the
 * Worker serves a constant document.
 */
export default function Page() {
  return (
    <Suspense>
      <OrderTrackingPage />
    </Suspense>
  );
}
