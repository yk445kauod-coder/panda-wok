"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { signOutAction } from "@/lib/actions/auth";

/** Signs out through the server action so the auth cookies are cleared server-side. */
export function SignOutButton() {
  const t = useT();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      loading={pending}
      onClick={() => {
        setPending(true);
        void signOutAction();
      }}
    >
      <LogOut className="size-4" aria-hidden="true" />
      {t("common.signOut")}
    </Button>
  );
}
