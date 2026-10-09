"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff, Trash2, X } from "lucide-react";
import { Badge, Button } from "@/components/ui/button";
import { AdminForm, Field } from "@/components/admin/form-kit";
import {
  deleteCustomerNoteAction,
  saveCustomerNoteAction,
  toggleCustomerTagAction,
} from "@/lib/actions/admin";
import { formatDateTime } from "@/lib/utils/format";
import { useI18n, useT } from "@/components/i18n-provider";
import type { CustomerNote, CustomerTag, CustomerTagLink } from "@/lib/crm/customers";

/**
 * The staff-written half of a customer record: free-text notes and the owner's
 * tag vocabulary. Both are per-customer and both are the everyday reason a
 * staff member opens the record, so they sit at the top of the customer 360
 * rather than below the order history.
 *
 * Every tag in the vocabulary is rendered, assigned or not, so the control
 * doubles as a checklist — a one-tap toggle, not a search.
 */
export function CustomerNotesPanel({
  customerId,
  notes,
  tags,
  assigned,
  canEdit,
}: {
  customerId: string;
  notes: CustomerNote[];
  tags: CustomerTag[];
  assigned: CustomerTagLink[];
  canEdit: boolean;
}) {
  const t = useT();
  const assignedIds = new Set(assigned.map((tag) => tag.id));

  return (
    <section className="washi-panel p-4" aria-label={t("admin.pages.customerProfile.notes")}>
      <h2 className="font-display text-base font-semibold text-ink-900">
        {t("admin.pages.customerProfile.notes")}
      </h2>

      <div className="mt-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-700/75">
          {t("admin.pages.customerProfile.tags")}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <TagToggle
              key={tag.id}
              customerId={customerId}
              tag={tag}
              assigned={assignedIds.has(tag.id)}
              canEdit={canEdit}
            />
          ))}
        </div>
      </div>

      {canEdit ? (
        <div className="mt-4">
          <AdminForm
            action={saveCustomerNoteAction}
            submitLabel={t("admin.pages.customerProfile.addNote")}
            options={{ resetOnSuccess: true }}
          >
            <input type="hidden" name="customerId" value={customerId} />
            <Field
              name="body"
              label={t("admin.pages.customerProfile.noteLabel")}
              type="textarea"
              required
              hint={t("admin.pages.customerProfile.noteHint")}
            />
            <label className="flex items-center gap-2 text-sm text-ink-800">
              <input type="checkbox" name="isPinned" value="true" className="size-4" />
              {t("admin.pages.customerProfile.pinNote")}
            </label>
          </AdminForm>
        </div>
      ) : null}

      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-ink-700/70">
          {t("admin.pages.customerProfile.noNotes")}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notes.map((note) => (
            <NoteRow key={note.id} customerId={customerId} note={note} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TagToggle({
  customerId,
  tag,
  assigned,
  canEdit,
}: {
  customerId: string;
  tag: CustomerTag;
  assigned: boolean;
  canEdit: boolean;
}) {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  // The label is bilingual; the console locale decides which one is read.
  const label = locale === "ar" ? tag.label_ar : tag.label_en;

  async function toggle() {
    if (!canEdit || pending) return;
    setPending(true);
    const formData = new FormData();
    formData.set("customerId", customerId);
    formData.set("tagId", tag.id);
    formData.set("assign", String(!assigned));
    const result = await toggleCustomerTagAction(formData);
    setPending(false);
    if (result.ok) router.refresh();
  }

  if (!canEdit) {
    return assigned ? (
      <Badge tone={tag.tone as "neutral"}>{label}</Badge>
    ) : null;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={assigned}
      className="disabled:opacity-50"
    >
      <Badge tone={assigned ? (tag.tone as "neutral") : "neutral"}>
        {label}
        {assigned ? <X className="ms-1 inline size-3" aria-hidden="true" /> : null}
      </Badge>
    </button>
  );
}

function NoteRow({
  customerId,
  note,
  canEdit,
}: {
  customerId: string;
  note: CustomerNote;
  canEdit: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(action: (formData: FormData) => Promise<{ ok: boolean }>, assignPinned?: boolean) {
    setPending(true);
    const formData = new FormData();
    formData.set("customerId", customerId);
    formData.set("noteId", note.id);
    if (assignPinned !== undefined) {
      formData.set("body", note.body);
      formData.set("isPinned", String(assignPinned));
    }
    const result = await action(formData);
    setPending(false);
    if (result.ok) router.refresh();
  }

  return (
    <li className="rounded-xl border border-ink-900/10 p-3">
      <p className="whitespace-pre-wrap text-sm text-ink-800/90">{note.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-700/65">
        <span>{formatDateTime(note.created_at)}</span>
        {note.author_name ? <span>· {note.author_name}</span> : null}
        {note.is_pinned ? (
          <Badge tone="warning">{t("admin.pages.customerProfile.pinned")}</Badge>
        ) : null}
        {canEdit ? (
          <span className="ms-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(saveCustomerNoteAction, !note.is_pinned)}
              aria-label={t("admin.pages.customerProfile.pinNote")}
            >
              {note.is_pinned ? (
                <PinOff className="size-3.5" aria-hidden="true" />
              ) : (
                <Pin className="size-3.5" aria-hidden="true" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(deleteCustomerNoteAction)}
              aria-label={t("admin.common.delete")}
            >
              <Trash2 className="size-3.5 text-chili-600" aria-hidden="true" />
            </Button>
          </span>
        ) : null}
      </div>
    </li>
  );
}
