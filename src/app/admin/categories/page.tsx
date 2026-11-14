import { Suspense } from "react";
import { CategoriesPage } from "@/components/admin/pages/categories";

export default function Page() {
  return (
    <Suspense>
      <CategoriesPage />
    </Suspense>
  );
}
