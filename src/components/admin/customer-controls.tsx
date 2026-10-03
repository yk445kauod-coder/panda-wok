"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Badge, Button } from "@/components/ui/button";
import { cn, humanise } from "@/lib/utils/format";
import { setUserBlockedAction, saveStaffAction, createStaffAccountAction, adjustLoyaltyPointsAction, deleteCustomerAction } from "@/lib/actions/admin";
import { AdminForm, Field, Toggle } from "@/components/admin/form-kit";
import type { StaffRole } from "@/lib/auth/rbac";

import { useErrorText, useT } from "@/components/i18n-provider";
const ROLES: StaffRole[] = ["owner", "admin", "manager", "kitchen", "support", "marketing"];

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
  const t = useT();
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
            ? t("admin.users.confirmUnblock")
            : t("admin.users.confirmBlock")
          : isBlocked
            ? t("admin.users.unblock")
            : t("admin.users.block")}
      </Button>
      {confirming ? (
        <span className="text-[11px] text-ink-700/70">
          {isBlocked
            ? t("admin.users.willOrder", { name })
            : t("admin.users.willNotOrder", { name })}
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

/**
 * Permanently delete one customer. Distinct from blocking: blocking is a flag,
 * this removes the account and profile from the database. It is irreversible,
 * so it takes a typed DELETE confirmation and surfaces the server's refusal
 * when the customer still has order history.
 */
export function DeleteCustomerControl({
  userId,
  name,
  hasOrders,
}: {
  userId: string;
  name: string;
  hasOrders: boolean;
}) {
  const router = useRouter();
  const errorText = useErrorText();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("confirm", confirm);

    const result = await deleteCustomerAction(formData);

    if (!result.ok) {
      setError(errorText(result.error));
      setPending(false);
      return;
    }

    setPending(false);
    router.push("/admin/crm");
    router.refresh();
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={hasOrders}
        title={hasOrders ? t("admin.pages.customerProfile.deleteBlocked") : undefined}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        {t("admin.pages.customerProfile.delete")}
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-chili-500/30 bg-chili-500/6 p-3">
      <p className="flex items-start gap-2 text-xs font-medium text-chili-700">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {t("admin.pages.customerProfile.deleteWarning", { name })}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="DELETE"
          className="h-9 w-28 rounded-lg border border-ink-900/15 bg-rice-50 px-2 text-sm text-ink-900 outline-none focus:border-chili-500"
          aria-label={t("admin.pages.customerProfile.deleteConfirmLabel")}
        />
        <Button
          type="button"
          variant="danger"
          size="sm"
          loading={pending}
          disabled={confirm !== "DELETE"}
          onClick={run}
        >
          {t("admin.pages.customerProfile.delete")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setConfirm("");
            setError(null);
          }}
        >
          {t("common.cancel")}
        </Button>
      </div>
      {error ? (
        <span role="alert" className="mt-2 block text-[11px] text-chili-600">
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
  const t = useT();
  const [role, setRole] = useState<StaffRole>(currentRole ?? "kitchen");
  const grantable = ROLES.filter(
    (option) =>
      canGrantPrivileged || (option !== "owner" && option !== "admin"),
  );

  return (
    <AdminForm
      action={saveStaffAction}
      submitLabel={currentRole ? t("admin.users.updateRole") : t("admin.users.grantStaff")}
      options={{ successMessage: t("admin.users.staffUpdated") }}
    >
      <input type="hidden" name="userId" value={userId} />
      <Field
        name="displayName"
        label={t("admin.users.displayName")}
        hint={t("admin.users.displayNameHint")}
        defaultValue={displayName ?? ""}
      />

      <Field
        name="loginId"
        label={t("admin.users.loginId")}
        hint={t("admin.users.loginIdHint")}
        defaultValue={currentLoginId ?? ""}
      />

      <div>
        <label htmlFor={`role-${userId}`} className="block text-sm font-medium text-ink-900">
          {t("admin.users.role")}
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
              {t(`admin.term.role.${option}`)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-700/65">{t(`admin.users.roleHint.${role}`)}</p>
      </div>

      <Toggle
        name="isActive"
        label={t("admin.users.active")}
        defaultChecked={isActive}
        hint={t("admin.users.activeHint")}
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
  const t = useT();
  const [role, setRole] = useState<StaffRole>("kitchen");
  const grantable = ROLES.filter(
    (option) => canGrantPrivileged || (option !== "owner" && option !== "admin"),
  );

  return (
    <AdminForm
      action={createStaffAccountAction}
      submitLabel={t("admin.users.createAccount")}
      options={{ successMessage: t("admin.users.createAccountDone") }}
    >
      <Field
        name="fullName"
        label={t("admin.users.fullName")}
        placeholder="Mona Adel"
        required
      />
      <Field
        name="loginId"
        label={t("admin.users.loginId")}
        hint={t("admin.users.loginIdNewHint")}
        placeholder="01001234567"
        required
      />
      <div>
        <label htmlFor="new-staff-role" className="block text-sm font-medium text-ink-900">
          {t("admin.users.role")}
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
              {t(`admin.term.role.${option}`)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-700/65">{t(`admin.users.roleHint.${role}`)}</p>
      </div>
      <Field
        name="phone"
        label={t("admin.users.phoneOptional")}
        hint={t("admin.users.phoneHint")}
        placeholder="01001234567"
      />
      <Field
        name="email"
        label={t("admin.users.emailOptional")}
        hint={t("admin.users.emailHint")}
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
  const t = useT();
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-vermilion-600 hover:text-vermilion-700">
        {existingResponse ? t("admin.pages.feedback.editReply") : t("admin.pages.feedback.reply")}
        {currentStatus !== "resolved" ? (
          <Badge tone="warning" className="ms-2">
            {t(`admin.term.feedbackStatus.${currentStatus}`)}
          </Badge>
        ) : null}
      </summary>

      <div className="mt-3">
        <AdminForm
          action={async (formData) => {
            const { respondToFeedbackAction } = await import("@/lib/actions/admin");
            return respondToFeedbackAction(formData);
          }}
          submitLabel={t("admin.pages.feedback.sendReply")}
          options={{ successMessage: t("admin.pages.feedback.replySaved") }}
        >
          <input type="hidden" name="feedbackId" value={feedbackId} />
          <Field
            name="response"
            label={t("admin.pages.feedback.yourReply")}
            defaultValue={existingResponse ?? ""}
            placeholder={t("admin.pages.feedback.replyPlaceholder")}
          />
          <div>
            <label
              htmlFor={`status-${feedbackId}`}
              className="block text-sm font-medium text-ink-900"
            >
              {t("admin.pages.feedback.markAs")}
            </label>
            <select
              id={`status-${feedbackId}`}
              name="status"
              defaultValue={currentStatus === "new" ? "reviewed" : currentStatus}
              className={cn(
                "mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm",
                "outline-none focus:border-miso-500",
              )}
            >
              <option value="reviewed">{t("admin.pages.feedback.inReview")}</option>
              <option value="resolved">{t("admin.pages.feedback.resolved")}</option>
            </select>
          </div>
        </AdminForm>
      </div>
    </details>
  );
}

/**
 * Publish / unpublish a rating.
 *
 * `feedback.is_public` is what allows a score to enter the public per-dish
 * average shown on the menu, so it is a one-tap, reversible decision with its
 * own confirmation — not a checkbox buried in the reply form. The label says
 * exactly what publishing does, because "public" alone does not tell an admin
 * that the number will appear next to a dish.
 */
export function FeedbackPublishControl({
  feedbackId,
  isPublic,
}: {
  feedbackId: string;
  isPublic: boolean;
}) {
  const router = useRouter();
  const errorText = useErrorText();
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(nextPublic: boolean) {
    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("feedbackId", feedbackId);
    formData.set("isPublic", String(nextPublic));

    const { setFeedbackPublishedAction } = await import("@/lib/actions/admin");
    const result = await setFeedbackPublishedAction(formData);

    if (!result.ok) {
      setError(errorText(result.error));
      setPending(false);
      return;
    }

    setPending(false);
    router.refresh();
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={isPublic ? "outline" : "secondary"}
          size="sm"
          loading={pending}
          onClick={() => run(!isPublic)}
        >
          {isPublic
            ? t("admin.pages.feedback.hideRating")
            : t("admin.pages.feedback.showRating")}
        </Button>
        <Badge tone={isPublic ? "success" : "neutral"}>
          {isPublic
            ? t("admin.pages.feedback.countsRating")
            : t("admin.pages.feedback.notShown")}
        </Badge>
      </div>
      {error ? (
        <span role="alert" className="text-[11px] text-chili-600">
          {error}
        </span>
      ) : null}
    </div>
  );
}
