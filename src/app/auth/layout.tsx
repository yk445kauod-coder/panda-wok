import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { PandaMark } from "@/components/layout/site-shell";

export const metadata: Metadata = buildMetadata({
  title: "Sign in",
  description: "Sign in to your Panda Wok account.",
  path: "/auth/sign-in",
  noIndex: true,
});

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session) redirect("/account");

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div
        aria-hidden="true"
        data-motion="decorative"
        className="seigaiha pointer-events-none absolute inset-0 opacity-40"
      />
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-ink-900"
          aria-label="Panda Wok home"
        >
          <PandaMark className="size-9" />
          <span className="font-display text-xl font-semibold">Panda&nbsp;Wok</span>
        </Link>

        <div className="washi-panel mt-6 w-full max-w-md p-5">{children}</div>

        <p className="mt-5 text-center text-xs text-ink-700/65">
          <Link href="/menu" className="hover:text-ink-900">
            Browse the menu without signing in
          </Link>
        </p>
      </div>
    </div>
  );
}
