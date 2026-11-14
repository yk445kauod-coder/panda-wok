import { Suspense } from "react";
import { FeedbackPage } from "@/components/admin/pages/feedback";

export default function Page() {
  return (
    <Suspense>
      <FeedbackPage />
    </Suspense>
  );
}
