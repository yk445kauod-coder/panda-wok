import { Suspense } from "react";
import { MenuPage } from "@/components/admin/pages/menu";

export default function Page() {
  return (
    <Suspense>
      <MenuPage />
    </Suspense>
  );
}
