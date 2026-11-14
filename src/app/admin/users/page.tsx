import { Suspense } from "react";
import { UsersPage } from "@/components/admin/pages/users";

export default function Page() {
  return (
    <Suspense>
      <UsersPage />
    </Suspense>
  );
}
