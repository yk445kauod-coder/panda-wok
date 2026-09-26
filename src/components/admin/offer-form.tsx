"use client";

import { useState } from "react";
import { AdminForm, Field, Toggle } from "@/components/admin/form-kit";
import { saveOfferAction } from "@/lib/actions/admin";
import type { Database } from "@/lib/types/database";

type Offer = Database["public"]["Tables"]["offers"]["Row"];

/**
 * Create/edit form for a threshold promotion.
 *
 * The "value" field means different things per kind — a percentage or a flat
 * amount — so the label and hint swap with the kind rather than leaving the
 * owner to remember which is which. A percentage offer also gets a ceiling,
 * because "20% off" with no cap is an unbounded giveaway on a large order.
 */
export function OfferForm({ offer }: { offer: Offer | null }) {
  const editing = Boolean(offer);
  const [kind, setKind] = useState<"percent" | "fixed">(offer?.kind ?? "fixed");

  return (
    <AdminForm
      action={saveOfferAction}
      submitLabel={editing ? "Save changes" : "Create offer"}
      options={{ successMessage: editing ? "Offer updated." : "Offer created." }}
    >
      {offer ? <input type="hidden" name="id" value={offer.id} /> : null}

      <Field
        name="nameEn"
        label="Offer name (English)"
        hint="Shown to customers at checkout, e.g. “50 off over 200”."
        defaultValue={offer?.name_en ?? ""}
        required
      />

      <Field
        name="nameAr"
        label="Offer name (Arabic)"
        hint="Optional. Falls back to the English name when empty."
        defaultValue={offer?.name_ar ?? ""}
        dir="rtl"
      />

      <div>
        <label htmlFor="kind" className="block text-sm font-medium text-ink-900">
          Type
        </label>
        <select
          id="kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as "percent" | "fixed")}
          className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        >
          <option value="fixed">Flat amount off (EGP)</option>
          <option value="percent">Percentage off (%)</option>
        </select>
      </div>

      <Field
        name="threshold"
        label="Minimum basket (EGP)"
        hint="The offer applies once the basket subtotal reaches this. Use 0 to always apply."
        type="number"
        defaultValue={String(offer?.threshold ?? 0)}
      />

      <Field
        name="value"
        label={kind === "percent" ? "Percentage off (%)" : "Amount off (EGP)"}
        hint={
          kind === "percent"
            ? "Between 0 and 100. Applied to the basket subtotal."
            : "A fixed amount taken off the basket subtotal."
        }
        type="number"
        defaultValue={String(offer?.value ?? "")}
        required
      />

      {kind === "percent" ? (
        <Field
          name="maxDiscount"
          label="Maximum discount (EGP)"
          hint="Optional ceiling, so a large order cannot discount without limit."
          type="number"
          defaultValue={offer?.max_discount != null ? String(offer.max_discount) : ""}
        />
      ) : null}

      <Field
        name="sortOrder"
        label="Priority"
        hint="Lower runs first when two offers save the same amount. The bigger saving always wins."
        type="number"
        defaultValue={String(offer?.sort_order ?? 0)}
      />

      <Toggle
        name="isEnabled"
        label="Active"
        hint="Inactive offers are kept but never applied at checkout."
        defaultChecked={offer?.is_enabled ?? true}
      />
    </AdminForm>
  );
}
