"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, EyeOff, ImageOff, Star, Trash2 } from "lucide-react";
import {
  deleteMenuItemAction,
  duplicateMenuItemAction,
  toggleMenuItemAction,
} from "@/lib/actions/admin";
import { AdminButtonAction } from "@/components/admin/form-kit";
import { Badge } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils/format";

type Row = {
  id: string;
  name_en: string;
  name_ar: string | null;
  slug: string;
  price: number;
  is_available: boolean;
  is_featured: boolean;
  has_transparent_png: boolean;
  image_url: string | null;
  category_name: string | null;
  stock_status: string | null;
};

/**
 * Menu list rows with inline enable/feature/transparent-PNG toggles. Each
 * toggle is a real server action, so the database and the public menu are
 * updated together rather than drifting from optimistic UI state.
 */
export function MenuItemRow({ item, categoryName }: { item: Row; categoryName: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(
    field: "is_available" | "is_featured" | "has_transparent_png",
    value: boolean,
  ) {
    setBusy(field);
    setError(null);
    const result = await toggleMenuItemAction(item.id, field, value);
    if (!result.ok) {
      setError(result.error.message);
      setBusy(null);
      return;
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <li className="washi-panel p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-rice-200"
        >
          {item.image_url ? (
            // Remote hosts are configured in next.config.ts; plain img avoids
            // a layout shift for a thumbnail this small.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageOff className="size-5 text-ink-700/40" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-900">{item.name_en}</span>
            {item.name_ar ? (
              <span className="text-xs text-ink-700/70" dir="rtl">
                {item.name_ar}
              </span>
            ) : null}
            {!item.is_available ? <Badge tone="danger">Hidden</Badge> : null}
            {item.is_featured ? <Badge tone="plum">Featured</Badge> : null}
            {item.has_transparent_png ? <Badge tone="info">Transparent PNG</Badge> : null}
          </div>

          <p className="mt-0.5 text-xs text-ink-700/70">
            {categoryName ?? "No category"} · /menu/{item.slug}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-sm font-medium tabular-nums text-ink-900">
              {formatPrice(item.price)}
            </span>

            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-800">
              <input
                type="checkbox"
                checked={item.is_available}
                disabled={busy !== null}
                onChange={(event) => toggle("is_available", event.target.checked)}
                className="size-3.5 accent-plum-600"
              />
              {busy === "is_available" ? "Saving…" : "Orderable"}
            </label>

            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-800">
              <input
                type="checkbox"
                checked={item.is_featured}
                disabled={busy !== null}
                onChange={(event) => toggle("is_featured", event.target.checked)}
                className="size-3.5 accent-plum-600"
              />
              <Star className="size-3" aria-hidden="true" />
              {busy === "is_featured" ? "Saving…" : "Featured"}
            </label>

            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-800">
              <input
                type="checkbox"
                checked={item.has_transparent_png}
                disabled={busy !== null}
                onChange={(event) => toggle("has_transparent_png", event.target.checked)}
                className="size-3.5 accent-plum-600"
              />
              {busy === "has_transparent_png" ? "Saving…" : "Transparent PNG"}
            </label>
          </div>

          {error ? (
            <p role="alert" className="mt-1.5 text-xs text-chili-600">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <a
            href={`/admin/menu?edit=${item.id}`}
            className="rounded-lg border border-ink-900/15 px-3 py-1.5 text-center text-xs font-medium text-ink-800 hover:bg-rice-200"
          >
            Edit
          </a>
          <AdminButtonAction
            action={() => duplicateMenuItemAction(item.id)}
            size="sm"
            variant="ghost"
          >
            <Copy className="size-3.5" aria-hidden="true" />
            Copy
          </AdminButtonAction>
          <AdminButtonAction
            action={() => deleteMenuItemAction(item.id)}
            variant="ghost"
            size="sm"
            confirm="Archive this dish? It is hidden from customers but kept in past orders."
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Archive
          </AdminButtonAction>
        </div>
      </div>
    </li>
  );
}

/** Small header shown above a group of rows from the same category. */
export function CategoryHeading({
  name,
  count,
  slug,
}: {
  name: string;
  count: number;
  slug: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <h2 className="font-display text-base font-semibold text-ink-900">
        {name}{" "}
        <span className="text-sm font-normal text-ink-700/60">({count})</span>
      </h2>
      <span className="text-xs text-ink-700/60">/menu/{slug}</span>
    </div>
  );
}

export function HiddenNotice({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="flex items-center gap-2 rounded-xl bg-rice-200/70 px-3 py-2 text-xs text-ink-800">
      <EyeOff className="size-3.5" aria-hidden="true" />
      {count} archived dish{count === 1 ? "" : "es"} hidden from this list and from
      customers.
    </p>
  );
}