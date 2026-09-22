import Link from "next/link";
import { NotepadText, ShieldX } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { capabilitiesFor } from "@/lib/auth/rbac";
import { humanise } from "@/lib/utils/format";

export const metadata = {
  title: "Access denied",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Destination for a failed capability check. It deliberately does not redirect
 * again, so the caller sees a plain explanation rather than a redirect loop.
 */
export default async function AdminDeniedPage() {
  const session = await getSession();
  const capabilities = session?.role ? capabilitiesFor(session.role) : [];

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="washi-panel p-6 text-center">
        <div
          aria-hidden="true"
          className="mx-auto grid size-12 place-items-center rounded-full bg-chili-500/12 text-chili-600"
        >
          <ShieldX className="size-6" />
        </div>

        <h1 className="mt-4 font-display text-xl font-semibold text-ink-900">
          This area is not available to your role
        </h1>

        <p className="mx-auto mt-2 max-w-prose text-sm text-ink-700/80">
          {session?.role
            ? `You are signed in as ${humanise(session.role)}, and that role does not include access to this page. Nothing is broken — the kitchen simply keeps different areas to different people.`
            : "You do not have a staff role, so this page is not available."}
        </p>

        {capabilities.length > 0 ? (
          <div className="mt-4 rounded-xl border border-ink-900/10 bg-rice-50 p-3 text-left">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-700/75">
              <NotepadText className="size-3.5" aria-hidden="true" />
              What you can do
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {capabilities.map((capability) => (
                <li
                  key={capability}
                  className="rounded-full bg-rice-200 px-2 py-0.5 text-xs text-ink-800"
                >
                  {humanise(capability)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/admin"
            className="rounded-xl bg-plum-600 px-4 py-2.5 text-sm font-medium text-rice-50 hover:bg-plum-700"
          >
            Back to the dashboard
          </Link>
          <Link
            href="/menu"
            className="rounded-xl border border-ink-900/15 px-4 py-2.5 text-sm text-ink-800 hover:bg-rice-200"
          >
            Go to the customer site
          </Link>
        </div>

        <p className="mt-4 text-xs text-ink-700/60">
          Need access? Ask an owner or admin to review your staff role.
        </p>
      </div>
    </div>
  );
}
