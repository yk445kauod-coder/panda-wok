"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";

/** Signs out through the server action so the auth cookies are cleared server-side. */
export function SignOutButton() {
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
      Sign out
    </Button>
  );
}
