import Link from "next/link";
import { EnsoMark } from "@/components/ui/empty-state";

/**
 * 404 page. It suggests real destinations rather than apologising, and keeps
 * the customer inside the ordering flow.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <EnsoMark className="size-20 text-indigo-600/70" />

      <h1 className="mt-6 font-display text-2xl font-semibold text-ink-900">
        That page is not on the menu
      </h1>
      <p className="mt-2 text-sm text-ink-700/85">
        The link may be old, or the dish may have been renamed. Everything we cook right
        now is one tap away.
      </p>

      <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
        <Link
          href="/menu"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-6 font-medium text-rice-50 hover:bg-indigo-700 sm:flex-1"
        >
          Browse the menu
        </Link>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-ink-900/15 px-6 font-medium text-ink-900 hover:bg-rice-200 sm:flex-1"
        >
          Back home
        </Link>
      </div>

      <p className="mt-5 text-xs text-ink-700/65">
        Looking for an order?{" "}
        <Link href="/orders" className="font-medium text-indigo-600 hover:text-indigo-700">
          Track it here
        </Link>
      </p>
    </main>
  );
}
