"use client";

import { useState } from "react";
import { AdminForm, Field, Toggle } from "@/components/admin/form-kit";
import { saveOfferAction } from "@/lib/actions/admin";
import type { Database } from "@/lib/types/database";

type Offer = Database["public"]["Tables"]["offers"]["Row"];

export type CustomerOption = { id: string; name: string };

/**
 * Create/edit form for a threshold promotion.
 *
 * The "value" field means different things per kind — a percentage or a flat
 * amount — so the label and hint swap with the kind rather than leaving the
 * owner to remember which is which. A percentage offer also gets a ceiling,
 * because "20% off" with no cap is an unbounded giveaway on a large order.
 *
 * A promotion is either for everyone (the default) or targeted at one customer.
 * `fixedCustomerId` locks the form to a single person for the per-customer
 * shortcut; otherwise `customers` drives a picker.
 */
export function OfferForm({
  offer,
  customers = [],
  fixedCustomerId,
  fixedCustomerName,
}: {
  offer: Offer | null;
  customers?: CustomerOption[];
  fixedCustomerId?: string;
  fixedCustomerName?: string;
}) {
  const editing = Boolean(offer);
  const [kind, setKind] = useState<"percent" | "fixed">(offer?.kind ?? "fixed");
  const [customerId, setCustomerId] = useState<string>(
    fixedCustomerId ?? offer?.customer_id ?? "",
  );

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

      {fixedCustomerId ? (
        <input type="hidden" name="customerId" value={fixedCustomerId} />
      ) : (
        <div>
          <label htmlFor="customerId" className="block text-sm font-medium text-ink-900">
            Who gets this offer
          </label>
          <select
            id="customerId"
            name="customerId"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="">Everyone</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-700/65">
            {customerId
              ? "Only this customer will see and get this discount at checkout."
              : "Applies to every customer at checkout, as before."}
          </p>
        </div>
      )}

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

      {fixedCustomerName ? (
        <p className="rounded-xl bg-rice-100/70 p-3 text-xs text-ink-700/80">
          This offer is only for {fixedCustomerName}. It shows in their checkout
          and on their invoice; no other customer can see or receive it.
        </p>
      ) : null}
    </AdminForm>
  );
}
