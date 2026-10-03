"use client";

import { AdminForm, Field, TextArea, Toggle } from "@/components/admin/form-kit";
import {
  recordStockMovementAction,
  saveStockItemAction,
} from "@/lib/actions/admin";
import type { AdminStockItem } from "@/lib/services/admin-catalog";
import { formatNumber } from "@/lib/utils/format";

export type StockOption = { id: string; name_en: string; unit: string };

/**
 * Create/edit form for a stock item. The quantity here is the authoritative
 * count; once the item exists, day-to-day changes should go through the
 * movement form so there is an audit trail.
 */
export function StockItemForm({ item }: { item: AdminStockItem | null }) {
  const editing = Boolean(item);

  return (
    <AdminForm
      action={saveStockItemAction}
      submitLabel={editing ? "Save changes" : "Add stock item"}
      options={{ successMessage: editing ? "Stock item updated." : "Stock item added." }}
    >
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Identity and units</legend>
        <Field name="nameEn" label="Name (English)" defaultValue={item?.name_en ?? ""} />
        <Field
          name="nameAr"
          label="Name (Arabic)"
          hint="Shown right to left alongside the English name."
          dir="rtl"
          defaultValue={item?.name_ar ?? ""}
        />
        <Field
          name="unit"
          label="Unit"
          hint="How this is counted: kg, litre, piece, pack."
          defaultValue={item?.unit ?? "kg"}
        />
        <Field
          name="supplier"
          label="Supplier"
          hint="Optional. Who to call when this runs low."
          defaultValue={item?.supplier ?? ""}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="sr-only">Quantities and cost</legend>
        <Field
          name="quantity"
          label="Quantity on hand"
          type="number"
          defaultValue={String(item?.quantity ?? 0)}
        />
        <Field
          name="minThreshold"
          label="Reorder threshold"
          type="number"
          hint="At or below this the item reads as low."
          defaultValue={String(item?.min_threshold ?? 0)}
        />
        <Field
          name="costPerUnit"
          label="Cost per unit (EGP)"
          type="number"
          hint="Optional. Used for stock value reporting."
          defaultValue={item?.cost_per_unit == null ? "" : String(item.cost_per_unit)}
        />
      </fieldset>

      <Toggle
        name="autoLinkAvailability"
        label="Link to dish availability"
        defaultChecked={item?.auto_link_availability ?? true}
        hint="When on, a linked dish can be made unavailable automatically as this item runs out."
      />

      <TextArea
        name="notes"
        label="Notes"
        rows={2}
        hint="Storage location, par-level reminders, delivery days."
        defaultValue={item?.notes ?? ""}
      />

      {editing ? (
        <p className="rounded-xl bg-rice-200/60 px-3 py-2 text-xs text-ink-800">
          Current status reads as{" "}
          <span className="font-medium">{item?.status ?? "ok"}</span> from the quantity
          above. To change stock over time, record a movement below instead — that keeps
          the history and can flip linked dishes automatically.
        </p>
      ) : null}
    </AdminForm>
  );
}

const DIRECTIONS = [
  { value: "in", label: "Stock in — delivery received" },
  { value: "out", label: "Stock out — used or sold" },
  { value: "adjust", label: "Adjustment — stock count correction" },
] as const;

/**
 * Records one stock movement. Values are limited to the directions the server
 * schema accepts (in/out/adjust) so the form cannot request a rejected write.
 */
export function StockMovementForm({ items }: { items: StockOption[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-700/75">
        Add a stock item first — movements are always recorded against one.
      </p>
    );
  }

  return (
    <AdminForm
      action={recordStockMovementAction}
      submitLabel="Record movement"
      options={{
        successMessage: "Movement recorded.",
        resetOnSuccess: true,
      }}
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Movement details</legend>

        <div>
          <label htmlFor="stockItemId" className="block text-sm font-medium text-ink-900">
            Stock item
          </label>
          <select
            id="stockItemId"
            name="stockItemId"
            defaultValue={items[0]?.id ?? ""}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name_en} ({item.unit})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="direction" className="block text-sm font-medium text-ink-900">
            Direction
          </label>
          <select
            id="direction"
            name="direction"
            defaultValue="in"
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            {DIRECTIONS.map((direction) => (
              <option key={direction.value} value={direction.value}>
                {direction.label}
              </option>
            ))}
          </select>
        </div>

        <Field
          name="quantity"
          label="Quantity"
          type="number"
          hint="Always a positive number; the direction decides whether it adds or removes."
        />
        <Field
          name="reason"
          label="Reason"
          hint="Optional but useful: supplier, spoilage, wastage, stock count."
        />
      </fieldset>

      <p className="rounded-xl bg-rice-200/60 px-3 py-2 text-xs text-ink-800">
        A movement updates the quantity and recomputes the status. If a linked dish has
        automatic availability switched on, running out here can make that dish
        unavailable on the public menu. Staff can always override the dish by hand in the
        Menu CMS.
      </p>

      <p className="text-xs text-ink-700/65">
        {formatNumber(items.length)} stock item{items.length === 1 ? "" : "s"} available to
        record against.
      </p>
    </AdminForm>
  );
}
