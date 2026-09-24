"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { AdminButtonAction, AdminForm, Field, Toggle } from "@/components/admin/form-kit";
import {
  deleteAnnouncementAction,
  deleteDeliveryZoneAction,
  deleteFaqAction,
  deletePageContentAction,
  saveAnnouncementAction,
  saveDeliveryZoneAction,
  saveFaqAction,
  savePageContentAction,
} from "@/lib/actions/content";
import { Badge } from "@/components/ui/button";
import { cn } from "@/lib/utils/format";
import type { Database } from "@/lib/types/database";

type ContentRow = Database["public"]["Tables"]["page_content"]["Row"];
type FaqRow = Database["public"]["Tables"]["faqs"]["Row"];
type ZoneRow = Database["public"]["Tables"]["delivery_zones"]["Row"];
type AnnouncementRow = Database["public"]["Tables"]["announcements"]["Row"];

export const CONTENT_PAGES = [
  { key: "home", label: "Home" },
  { key: "about", label: "About" },
  { key: "contact", label: "Contact" },
  { key: "faq", label: "FAQ" },
  { key: "menu", label: "Menu" },
] as const;

/* ------------------------------------------------------------- page copy */

export function PageContentForm({ row }: { row: ContentRow | null }) {
  const editing = Boolean(row);
  return (
    <AdminForm
      action={savePageContentAction}
      submitLabel={editing ? "Save section" : "Add section"}
      options={{ successMessage: editing ? "Section updated." : "Section added." }}
    >
      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pageKey" className="block text-sm font-medium text-ink-900">
            Page
          </label>
          <select
            id="pageKey"
            name="pageKey"
            defaultValue={row?.page_key ?? "about"}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            {CONTENT_PAGES.map((page) => (
              <option key={page.key} value={page.key}>
                {page.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="locale" className="block text-sm font-medium text-ink-900">
            Language
          </label>
          <select
            id="locale"
            name="locale"
            defaultValue={row?.locale ?? "en"}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>
      </div>

      <Field
        name="sectionKey"
        label="Section key"
        hint="Stable identifier the page uses to find this section, e.g. story."
        defaultValue={row?.section_key ?? ""}
      />
      <Field
        name="heading"
        label="Heading"
        defaultValue={row?.heading ?? ""}
        dir={row?.locale === "ar" ? "rtl" : "ltr"}
      />
      <Field
        name="body"
        label="Body"
        hint="Plain text. Line breaks are preserved; a blank section hides the block."
        defaultValue={row?.body ?? ""}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="sortOrder"
          label="Sort order"
          type="number"
          defaultValue={String(row?.sort_order ?? 0)}
        />
      </div>
      <Toggle
        name="isPublished"
        label="Published"
        defaultChecked={row?.is_published ?? true}
        hint="Drafts stay hidden from customers."
      />
    </AdminForm>
  );
}

export function PageContentList({ rows }: { rows: ContentRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="washi-panel p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink-900">
                  {row.page_key} · {row.section_key}
                </span>
                <Badge tone={row.locale === "ar" ? "plum" : "info"}>
                  {row.locale === "ar" ? "AR" : "EN"}
                </Badge>
                {row.is_published ? (
                  <Badge tone="success">Published</Badge>
                ) : (
                  <Badge tone="warning">Draft</Badge>
                )}
              </div>
              {row.heading ? (
                <p className="mt-1 text-sm font-medium text-ink-800">{row.heading}</p>
              ) : null}
              {row.body ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-700/75">{row.body}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <EditLink href={`/admin/content?section=${row.id}`} />
              <AdminButtonAction
                action={() => deletePageContentAction(row.id)}
                variant="ghost"
                size="sm"
                confirm={`Delete the “${row.section_key}” section?`}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </AdminButtonAction>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------- FAQs */

export function FaqForm({ row }: { row: FaqRow | null }) {
  const editing = Boolean(row);
  return (
    <AdminForm
      action={saveFaqAction}
      submitLabel={editing ? "Save FAQ" : "Add FAQ"}
      options={{ successMessage: editing ? "FAQ updated." : "FAQ added." }}
    >
      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="faqLocale" className="block text-sm font-medium text-ink-900">
            Language
          </label>
          <select
            id="faqLocale"
            name="locale"
            defaultValue={row?.locale ?? "en"}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>
        <Field
          name="sortOrder"
          label="Sort order"
          type="number"
          defaultValue={String(row?.sort_order ?? 0)}
        />
      </div>

      <Field
        name="question"
        label="Question"
        defaultValue={row?.question ?? ""}
        dir={row?.locale === "ar" ? "rtl" : "ltr"}
      />
      <Field name="answer" label="Answer" defaultValue={row?.answer ?? ""} />
      <Toggle name="isPublished" label="Published" defaultChecked={row?.is_published ?? true} />
    </AdminForm>
  );
}

export function FaqList({ rows }: { rows: FaqRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="washi-panel p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink-900">{row.question}</span>
                <Badge tone={row.locale === "ar" ? "plum" : "info"}>
                  {row.locale === "ar" ? "AR" : "EN"}
                </Badge>
                {row.is_published ? null : <Badge tone="warning">Draft</Badge>}
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-700/75">{row.answer}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <EditLink href={`/admin/content?faq=${row.id}`} />
              <AdminButtonAction
                action={() => deleteFaqAction(row.id)}
                variant="ghost"
                size="sm"
                confirm="Delete this FAQ?"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </AdminButtonAction>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------- delivery zones */

export function DeliveryZoneForm({ row }: { row: ZoneRow | null }) {
  const editing = Boolean(row);
  return (
    <AdminForm
      action={saveDeliveryZoneAction}
      submitLabel={editing ? "Save zone" : "Add zone"}
      options={{ successMessage: editing ? "Zone updated." : "Zone added." }}
    >
      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="nameEn" label="Name (English)" defaultValue={row?.name_en ?? ""} />
        <Field
          name="nameAr"
          label="Name (Arabic)"
          dir="rtl"
          defaultValue={row?.name_ar ?? ""}
        />
      </div>
      <Field
        name="areas"
        label="Areas"
        hint="Comma-separated list of neighbourhoods this zone covers."
        defaultValue={(row?.areas ?? []).join(", ")}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          name="fee"
          label="Delivery fee"
          type="number"
          defaultValue={String(row?.fee ?? 0)}
        />
        <Field
          name="freeOver"
          label="Free over"
          type="number"
          hint="Blank for never free."
          defaultValue={row?.free_over === null ? "" : String(row?.free_over ?? "")}
        />
        <Field
          name="etaMinutes"
          label="Typical minutes"
          type="number"
          defaultValue={row?.eta_minutes === null ? "" : String(row?.eta_minutes ?? "")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="sortOrder"
          label="Sort order"
          type="number"
          defaultValue={String(row?.sort_order ?? 0)}
        />
      </div>
      <Toggle name="isActive" label="Active" defaultChecked={row?.is_active ?? true} />
    </AdminForm>
  );
}

export function DeliveryZoneList({ rows }: { rows: ZoneRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="washi-panel p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink-900">{row.name_en}</span>
                {row.is_active ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Badge tone="neutral">Off</Badge>
                )}
                <Badge tone="plum">Fee {row.fee}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-ink-700/75">
                {row.areas.length > 0 ? row.areas.join(" · ") : "No areas listed"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <EditLink href={`/admin/content?zone=${row.id}`} />
              <AdminButtonAction
                action={() => deleteDeliveryZoneAction(row.id)}
                variant="ghost"
                size="sm"
                confirm={`Delete the “${row.name_en}” zone?`}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </AdminButtonAction>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------- announcements */

export function AnnouncementForm({ row }: { row: AnnouncementRow | null }) {
  const editing = Boolean(row);
  const [tone, setTone] = useState(row?.tone ?? "info");
  return (
    <AdminForm
      action={saveAnnouncementAction}
      submitLabel={editing ? "Save announcement" : "Add announcement"}
      options={{
        successMessage: editing ? "Announcement updated." : "Announcement added.",
      }}
    >
      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="announceLocale" className="block text-sm font-medium text-ink-900">
            Language
          </label>
          <select
            id="announceLocale"
            name="locale"
            defaultValue={row?.locale ?? "en"}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>
        <div>
          <label htmlFor="tone" className="block text-sm font-medium text-ink-900">
            Tone
          </label>
          <select
            id="tone"
            name="tone"
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="plum">Plum</option>
          </select>
        </div>
      </div>

      <Field name="message" label="Message" defaultValue={row?.message ?? ""} />
      <Field
        name="href"
        label="Link"
        hint="Optional. Where the announcement points, e.g. /menu."
        defaultValue={row?.href ?? ""}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="startsAt"
          label="Starts at"
          type="datetime-local"
          hint="Optional schedule. Blank means from now."
          defaultValue={row?.starts_at ? row.starts_at.slice(0, 16) : ""}
        />
        <Field
          name="endsAt"
          label="Ends at"
          type="datetime-local"
          hint="Optional. Blank means no end."
          defaultValue={row?.ends_at ? row.ends_at.slice(0, 16) : ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="sortOrder"
          label="Sort order"
          type="number"
          defaultValue={String(row?.sort_order ?? 0)}
        />
      </div>
      <Toggle name="isActive" label="Active" defaultChecked={row?.is_active ?? true} />
    </AdminForm>
  );
}

export function AnnouncementList({ rows }: { rows: AnnouncementRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="washi-panel p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink-900">{row.message}</span>
                <Badge tone={row.locale === "ar" ? "plum" : "info"}>
                  {row.locale === "ar" ? "AR" : "EN"}
                </Badge>
                <Badge tone="neutral">{row.tone}</Badge>
                {row.is_active ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Badge tone="neutral">Off</Badge>
                )}
              </div>
              {row.href ? (
                <p className="mt-0.5 text-xs text-ink-700/75">{row.href}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <EditLink href={`/admin/content?announcement=${row.id}`} />
              <AdminButtonAction
                action={() => deleteAnnouncementAction(row.id)}
                variant="ghost"
                size="sm"
                confirm="Delete this announcement?"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </AdminButtonAction>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ shared */

function EditLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-900/15",
        "bg-rice-50/70 px-3 text-sm font-medium text-ink-900 hover:bg-rice-100",
      )}
    >
      <Pencil className="size-3.5" aria-hidden="true" />
      Edit
    </a>
  );
}
