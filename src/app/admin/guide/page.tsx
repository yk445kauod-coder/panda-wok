import { BookOpen, Check, Minus } from "lucide-react";
import { getAdminSession } from "@/lib/auth/session";
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  capabilitiesFor,
  type StaffRole,
} from "@/lib/auth/rbac";
import { GUIDE_ROLE_ORDER, GUIDE_TOPICS } from "@/lib/admin/guide";
import { GuideBrowser } from "@/components/admin/guide-browser";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils/format";

export const metadata = {
  title: "Guide",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Capability → short human label, for the role comparison table. */
const CAPABILITY_LABELS: Record<string, string> = {
  "orders.view": "See orders",
  "orders.update": "Progress orders",
  "kitchen.view": "Kitchen board",
  "menu.manage": "Menu & categories",
  "stock.manage": "Stock",
  "stock.move": "Stock movements",
  "crm.view": "Customers",
  "crm.export": "Export customer data",
  "users.manage": "Team accounts",
  "loyalty.manage": "Loyalty",
  "feedback.manage": "Feedback",
  "chat.manage": "Customer chat",
  "broadcast.manage": "Broadcasts",
  "analytics.view": "Analytics",
  "ai.manage": "AI centre",
  "exports.manage": "Exports",
  "backups.view": "View backups",
  "backups.create": "Create backups",
  "backups.restore": "Restore backups",
  "settings.manage": "Settings",
  "roles.manage": "Assign roles",
};

/**
 * The ops manual. It opens for any unlocked member — unlike every other admin
 * screen it is not capability-gated, because its whole purpose is to tell a
 * member what they can and cannot do. The role table below is generated from the
 * live capability matrix, so it can never drift from what the server enforces.
 */
export default async function AdminGuidePage() {
  const session = await getAdminSession();
  const capabilities = session?.role ? capabilitiesFor(session.role) : [];
  const activeRole: StaffRole | null = session?.role ?? null;

  // Union of every capability any role holds, so the table is complete.
  const allCapabilities = [...new Set(GUIDE_ROLE_ORDER.flatMap((role) => capabilitiesFor(role)))];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reference"
        title="Ops guide"
        description="How the console works, what each role may do, and the exact rules the kitchen follows. Search it any time — it is always one tap from the navigation."
      />

      <div className="flex items-center gap-2 rounded-xl border border-ink-900/10 bg-rice-50 p-3 text-sm text-ink-700">
        <BookOpen className="size-4 shrink-0 text-vermilion-600" aria-hidden="true" />
        <span>
          {GUIDE_TOPICS.length} topics. You are currently{" "}
          <strong className="font-medium text-ink-900">
            {activeRole ? ROLE_LABELS[activeRole] : "unrecognised"}
          </strong>
          {activeRole ? ` — ${ROLE_DESCRIPTIONS[activeRole]}` : "."}
        </span>
      </div>

      <GuideBrowser capabilities={capabilities} />

      <section aria-labelledby="role-matrix" className="space-y-3">
        <div>
          <h2 id="role-matrix" className="font-display text-lg font-semibold text-ink-900">
            Role permissions
          </h2>
          <p className="mt-0.5 text-sm text-ink-700/80">
            Generated from the same matrix the server enforces. Your role is highlighted.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-ink-900/10 bg-rice-50">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-900/10">
                <th scope="col" className="p-3 text-start font-medium text-ink-700">
                  Permission
                </th>
                {GUIDE_ROLE_ORDER.map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className={cn(
                      "p-3 text-center text-xs font-semibold uppercase tracking-wide",
                      role === activeRole ? "text-vermilion-700" : "text-ink-600",
                    )}
                  >
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allCapabilities.map((capability) => (
                <tr key={capability} className="border-b border-ink-900/6 last:border-0">
                  <th scope="row" className="p-3 text-start font-normal text-ink-800">
                    {CAPABILITY_LABELS[capability] ?? capability}
                  </th>
                  {GUIDE_ROLE_ORDER.map((role) => {
                    const allowed = capabilitiesFor(role).includes(capability);
                    return (
                      <td
                        key={role}
                        className={cn("p-3 text-center", role === activeRole ? "bg-vermilion-600/4" : "")}
                      >
                        {allowed ? (
                          <Check className="mx-auto size-4 text-jade-600" aria-label="Allowed" />
                        ) : (
                          <Minus className="mx-auto size-4 text-ink-400" aria-label="Not allowed" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
