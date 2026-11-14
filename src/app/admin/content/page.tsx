import { Suspense } from "react";
import { ContentPage } from "@/components/admin/pages/content";

export default function Page() {
  return (
    <Suspense>
      <ContentPage />
    </Suspense>
  );
}
