"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Badge, Button } from "@/components/ui/button";
import { cn, humanise } from "@/lib/utils/format";
import { setUserBlockedAction, saveStaffAction, createStaffAccountAction, adjustLoyaltyPointsAction } from "@/lib/actions/admin";
import { AdminForm, Field, Toggle } from "@/components/admin/form-kit";
import type { StaffRole } from "@/lib/auth/rbac";

import { useErrorText } from "@/components/i18n-provider";
const ROLES: StaffRole[] = ["owner", "admin", "manager", "kitchen", "support", "marketing"];

const ROLE_HINTS: Record<StaffRole, string> = {
  owner: "Full access, including backups, roles and settings.",
  admin: "Everything operational except restoring backups and managing owner roles.",
  manager: "Operations, stock, menu, CRM, loyalty and exports.",
  kitchen: "Orders and preparation status only.",
  support: "Orders read, feedback and customer chat.",
  marketing: "Segments, broadcasts and analytics.",
};

/**
 * Block/unblock a customer. Blocking prevents ordering; it is reversible and a
 * reason is captured in the audit log by the server action.
 */
export function BlockUserControl({
  userId,
  isBlocked,
  name,
}: {
  userId: string;
  isBlocked: boolean;
  name: string;
}) {
  const router = useRouter();
  const errorText = useErrorText();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(nextBlocked: boolean) {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("blocked", String(nextBlocked));

    const result = await setUserBlockedAction(formData);

    if (!result.ok) {
      setError(errorText(result.error));
      setPending(false);
      return;
    }

    setConfirming(false);
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={confirming ? "danger" : isBlocked ? "outline" : "ghost"}
        size="sm"
        loading={pending}
        onClick={() => run(!isBlocked)}
      >
        {confirming
          ? isBlocked
            ? "Confirm unblock?"
            : "Confirm block?"
          : isBlocked
            ? "Unblock"
            : "Block"}
      </Button>
      {confirming ? (
        <span className="text-[11px] text-ink-700/70">
          {isBlocked
            ? `${name} will be able to order again.`
            : `${name} will not be able to place orders.`}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-[11px] text-chili-600">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Grant or change a staff role. The server refuses self-demotion. */
export function StaffRoleForm({
  userId,
  currentRole,
  currentLoginId,
  isActive,
  displayName,
  canGrantPrivileged,
}: {
  userId: string;
  currentRole: StaffRole | null;
  currentLoginId?: string | null;
  isActive: boolean;
  displayName: string | null;
  /** Owner-only: whether owner/admin may be chosen in the role picker. */
  canGrantPrivileged: boolean;
}) {
  const [role, setRole] = useState<StaffRole>(currentRole ?? "kitchen");
  const grantable = ROLES.filter(
    (option) =>
      canGrantPrivileged || (option !== "owner" && option !== "admin"),
  );

  return (
    <AdminForm
      action={saveStaffAction}
      submitLabel={currentRole ? "Update role" : "Grant staff access"}
      options={{ successMessage: "Staff role updated." }}
    >
      <input type="hidden" name="userId" value={userId} />
      <Field
        name="displayName"
        label="Display name"
        hint="Shown to other staff on messages and status changes."
        defaultValue={displayName ?? ""}
      />

      <Field
        name="loginId"
        label="Ops login id"
        hint="What this person types at /admin to open the console with this role. A phone number works well. Leave blank to use the shared passcode only."
        defaultValue={currentLoginId ?? ""}
      />

      <div>
        <label htmlFor={`role-${userId}`} className="block text-sm font-medium text-ink-900">
          Role
        </label>
        <select
          id={`role-${userId}`}
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as StaffRole)}
          className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        >
          {grantable.map((option) => (
            <option key={option} value={option}>
              {humanise(option)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-700/65">{ROLE_HINTS[role]}</p>
      </div>

      <Toggle
        name="isActive"
        label="Active"
        defaultChecked={isActive}
        hint="Inactive staff keep their history but lose access."
      />
    </AdminForm>
  );
}

/**
 * Owner-created team account. One step creates the account, sets its role, and
 * issues the login id the worker will use at /admin. No email, password, or
 * customer signup is involved — the login id *is* the credential.
 */
export function CreateStaffForm({ canGrantPrivileged }: { canGrantPrivileged: boolean }) {
  const [role, setRole] = useState<StaffRole>("kitchen");
  const grantable = ROLES.filter(
    (option) => canGrantPrivileged || (option !== "owner" && option !== "admin"),
  );

  return (
    <AdminForm
      action={createStaffAccountAction}
      submitLabel="Create team account"
      options={{ successMessage: "Team account created — share the ops login id." }}
    >
      <Field
        name="fullName"
        label="Full name"
        placeholder="Mona Adel"
        required
      />
      <Field
        name="loginId"
        label="Ops login id"
        hint="The credential they type at /admin. Use a mobile number or a short code."
        placeholder="01001234567"
        required
      />
      <div>
        <label htmlFor="new-staff-role" className="block text-sm font-medium text-ink-900">
          Role
        </label>
        <select
          id="new-staff-role"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as StaffRole)}
          className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        >
          {grantable.map((option) => (
            <option key={option} value={option}>
              {humanise(option)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-700/65">{ROLE_HINTS[role]}</p>
      </div>
      <Field
        name="phone"
        label="Phone (optional)"
        hint="Stored on the profile for contact. Not used to sign in."
        placeholder="01001234567"
      />
      <Field
        name="email"
        label="Email (optional)"
        hint="Recovery contact only. Leave blank to keep the account fully phone-first."
        placeholder="mona@example.com"
      />
    </AdminForm>
  );
}

/** Adjust a customer's loyalty balance with a mandatory reason. */
export function AdjustPointsForm({
  options,
}: {
  options: { id: string; name: string; points: number }[];
}) {
  const [userId, setUserId] = useState(options[0]?.id ?? "");
  const selected = options.find((option) => option.id === userId);

  if (options.length === 0) {
    return <p className="text-sm text-ink-700/70">No customers with loyalty accounts yet.</p>;
  }

  return (
    <AdminForm
      action={adjustLoyaltyPointsAction}
      submitLabel="Apply adjustment"
      options={{ successMessage: "Loyalty balance updated and recorded." }}
    >
      <div>
        <label htmlFor="loyalty-user" className="block text-sm font-medium text-ink-900">
          Customer
        </label>
        <select
          id="loyalty-user"
          name="userId"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} — {option.points} points
            </option>
          ))}
        </select>
      </div>

      <Field
        name="points"
        label="Points"
        hint="Positive to add, negative to deduct."
        placeholder="50"
      />
      <Field
        name="reason"
        label="Reason"
        hint="Recorded in the loyalty ledger and the audit log."
        placeholder="Goodwill for a late delivery"
      />

      {selected ? (
        <p className="flex items-center gap-2 rounded-xl bg-rice-200/70 px-3 py-2 text-xs text-ink-800">
          <AlertTriangle className="size-3.5 shrink-0 text-miso-600" aria-hidden="true" />
          Current balance for {selected.name}: {selected.points} points.
        </p>
      ) : null}
    </AdminForm>
  );
}

/** Response form for one piece of feedback, with an explicit status choice. */
export function FeedbackReplyControl({
  feedbackId,
  currentStatus,
  existingResponse,
}: {
  feedbackId: string;
  currentStatus: string;
  existingResponse: string | null;
}) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-plum-600 hover:text-plum-700">
        {existingResponse ? "Edit the reply" : "Reply"}
        {currentStatus !== "resolved" ? (
          <Badge tone="warning" className="ml-2">
            {humanise(currentStatus)}
          </Badge>
        ) : null}
      </summary>

      <div className="mt-3">
        <AdminForm
          action={async (formData) => {
            const { respondToFeedbackAction } = await import("@/lib/actions/admin");
            return respondToFeedbackAction(formData);
          }}
          submitLabel="Send reply"
          options={{ successMessage: "Reply saved and the customer notified." }}
        >
          <input type="hidden" name="feedbackId" value={feedbackId} />
          <Field
            name="response"
            label="Your reply"
            defaultValue={existingResponse ?? ""}
            placeholder="Sorry about that — we're sending a replacement dessert."
          />
          <div>
            <label
              htmlFor={`status-${feedbackId}`}
              className="block text-sm font-medium text-ink-900"
            >
              Mark as
            </label>
            <select
              id={`status-${feedbackId}`}
              name="status"
              defaultValue={currentStatus === "new" ? "in_review" : currentStatus}
              className={cn(
                "mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm",
                "outline-none focus:border-miso-500",
              )}
            >
              <option value="in_review">In review</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </AdminForm>
      </div>
    </details>
  );
}
