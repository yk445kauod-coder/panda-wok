"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Navigation, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { Badge, Button, Spinner } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useT } from "@/components/i18n-provider";
import {
  deleteAddressAction,
  saveAddressAction,
  setDefaultAddressAction,
} from "@/lib/actions/account";
import { cn } from "@/lib/utils/format";
import type { Address } from "@/lib/services/orders";

type Mode = { kind: "closed" } | { kind: "new" } | { kind: "edit"; address: Address };

/**
 * Address book. Saving posts a FormData payload to the server action, which
 * re-validates every field with Zod. Location capture is opt-in: the browser
 * asks permission only when the customer presses the button, and the coordinates
 * are stored exactly as reported (never invented).
 */
export function AddressBook({ addresses }: { addresses: Address[] }) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "closed" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracyM: number | null;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  function resetForm() {
    setMode({ kind: "closed" });
    setError(null);
    setFields({});
    setCoords(null);
    setLocationError(null);
  }

  function captureLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError(t("addresses.errors.locationUnsupported"));
      return;
    }

    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null,
        });
        setLocating(false);
      },
      (geolocationError) => {
        setLocating(false);
        setLocationError(
          geolocationError.code === geolocationError.PERMISSION_DENIED
            ? t("addresses.errors.locationDeclined")
            : t("addresses.errors.locationUnreadable"),
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});

    const formData = new FormData(event.currentTarget);
    const result = await saveAddressAction(formData);

    if (!result.ok) {
      setError(result.error.message);
      if ("fields" in result && result.fields) setFields(result.fields);
      setSaving(false);
      return;
    }

    setSaving(false);
    resetForm();
    router.refresh();
  }

  async function onDelete(addressId: string) {
    setPendingId(addressId);
    setError(null);
    const result = await deleteAddressAction(addressId);
    setPendingId(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  async function onMakeDefault(addressId: string) {
    setPendingId(addressId);
    setError(null);
    const result = await setDefaultAddressAction(addressId);
    setPendingId(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-5">
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-chili-500/30 bg-chili-500/8 p-3.5 text-sm text-chili-600"
        >
          {error}
        </p>
      ) : null}

      {addresses.length === 0 && mode.kind === "closed" ? (
        <EmptyState
          title={t("addresses.emptyTitle")}
          description={t("addresses.emptyBody")}
          action={
            <Button onClick={() => setMode({ kind: "new" })}>
              <Plus className="size-4" aria-hidden="true" />
              {t("addresses.addAddress")}
            </Button>
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {addresses.map((address) => (
              <li key={address.id} className="washi-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink-900">{address.label}</span>
                      {address.is_default ? (
                        <Badge tone="info">{t("common.default")}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-ink-700/85">
                      {[
                        address.address_line,
                        address.building
                          ? t("checkout.building", { value: address.building })
                          : null,
                        address.floor
                          ? t("checkout.floor", { value: address.floor })
                          : null,
                        address.apartment
                          ? t("checkout.apartment", { value: address.apartment })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {address.area ? (
                      <p className="mt-0.5 text-xs text-ink-700/70">
                        {address.area}, {address.city}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-ink-700/70">{address.city}</p>
                    )}
                    {address.landmark ? (
                      <p className="mt-0.5 text-xs text-ink-700/70">
                        {t("checkout.landmark", { value: address.landmark })}
                      </p>
                    ) : null}
                    {address.contact_name ? (
                      <p className="mt-0.5 text-xs text-ink-700/70">
                        {address.contact_name}
                        {address.contact_phone ? ` · ${address.contact_phone}` : ""}
                      </p>
                    ) : null}
                    {address.latitude !== null && address.longitude !== null ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-jade-600">
                        <Navigation className="size-3" aria-hidden="true" />
                        {t("addresses.coordinatesSaved")}
                        {address.accuracy_m
                          ? t("addresses.errors.accuracySuffix", {
                              meters: address.accuracy_m,
                            })
                          : ""}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode({ kind: "edit", address });
                        setCoords(
                          address.latitude !== null && address.longitude !== null
                            ? {
                                latitude: address.latitude,
                                longitude: address.longitude,
                                accuracyM: address.accuracy_m,
                              }
                            : null,
                        );
                        setLocationError(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-800 hover:bg-rice-200"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      {t("common.edit")}
                    </button>
                    {!address.is_default ? (
                      <button
                        type="button"
                        disabled={pendingId === address.id}
                        onClick={() => void onMakeDefault(address.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-plum-600 hover:bg-plum-600/8 disabled:opacity-50"
                      >
                        {pendingId === address.id ? (
                          <Spinner className="size-3.5" />
                        ) : (
                          <Star className="size-3.5" aria-hidden="true" />
                        )}
                        {t("common.default")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={pendingId === address.id}
                      onClick={() => void onDelete(address.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-chili-600 hover:bg-chili-500/8 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {mode.kind === "closed" ? (
            <Button className="mt-4" onClick={() => setMode({ kind: "new" })}>
              <Plus className="size-4" aria-hidden="true" />
              {t("addresses.addAnother")}
            </Button>
          ) : null}
        </>
      )}

      {mode.kind !== "closed" ? (
        <form
          onSubmit={onSubmit}
          className="washi-panel mt-4 p-4"
          aria-labelledby="address-form-heading"
        >
          <div className="flex items-center justify-between">
            <h2 id="address-form-heading" className="text-sm font-semibold text-ink-900">
              {mode.kind === "edit" ? t("addresses.editAddress") : t("addresses.newAddress")}
            </h2>
            <button
              type="button"
              onClick={resetForm}
              aria-label={t("addresses.closeForm")}
              className="grid size-8 place-items-center rounded-lg text-ink-700 hover:bg-rice-200"
            >
              <X className="size-4" />
            </button>
          </div>

          {mode.kind === "edit" ? (
            <input type="hidden" name="id" value={mode.address.id} />
          ) : null}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <FormField
              name="label"
              label={t("addresses.fields.label")}
              placeholder={t("addresses.fields.labelPlaceholder")}
              defaultValue={mode.kind === "edit" ? mode.address.label : ""}
              error={fields.label}
              required
            />
            <FormField
              name="contactName"
              label={t("addresses.fields.contactName")}
              defaultValue={mode.kind === "edit" ? (mode.address.contact_name ?? "") : ""}
              error={fields.contactName}
              autoComplete="name"
              required
            />
            <FormField
              name="contactPhone"
              label={t("addresses.fields.contactPhone")}
              type="tel"
              inputMode="tel"
              defaultValue={mode.kind === "edit" ? (mode.address.contact_phone ?? "") : ""}
              error={fields.contactPhone}
              autoComplete="tel"
              required
            />
            <FormField
              name="area"
              label={t("addresses.fields.area")}
              placeholder={t("addresses.fields.areaPlaceholder")}
              defaultValue={mode.kind === "edit" ? (mode.address.area ?? "") : ""}
              error={fields.area}
            />
            <div className="sm:col-span-2">
              <FormField
                name="addressLine"
                label={t("addresses.fields.addressLine")}
                defaultValue={mode.kind === "edit" ? mode.address.address_line : ""}
                error={fields.addressLine}
                autoComplete="street-address"
                required
              />
            </div>
            <FormField
              name="building"
              label={t("addresses.fields.building")}
              defaultValue={mode.kind === "edit" ? (mode.address.building ?? "") : ""}
              error={fields.building}
            />
            <FormField
              name="floor"
              label={t("addresses.fields.floor")}
              defaultValue={mode.kind === "edit" ? (mode.address.floor ?? "") : ""}
              error={fields.floor}
            />
            <FormField
              name="apartment"
              label={t("addresses.fields.apartment")}
              defaultValue={mode.kind === "edit" ? (mode.address.apartment ?? "") : ""}
              error={fields.apartment}
            />
            <FormField
              name="city"
              label={t("addresses.fields.city")}
              defaultValue={mode.kind === "edit" ? (mode.address.city ?? "") : "Alexandria"}
              error={fields.city}
              autoComplete="address-level2"
            />
            <div className="sm:col-span-2">
              <FormField
                name="landmark"
                label={t("addresses.fields.landmark")}
                placeholder={t("addresses.fields.landmarkPlaceholder")}
                defaultValue={mode.kind === "edit" ? (mode.address.landmark ?? "") : ""}
                error={fields.landmark}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="address-notes"
                className="block text-sm font-medium text-ink-900"
              >
                {t("addresses.fields.notes")}
              </label>
              <textarea
                id="address-notes"
                name="notes"
                rows={2}
                maxLength={300}
                defaultValue={mode.kind === "edit" ? (mode.address.notes ?? "") : ""}
                placeholder={t("addresses.fields.notesPlaceholder")}
                className="mt-1.5 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2 text-sm outline-none focus:border-miso-500"
              />
              {fields.notes ? (
                <p className="mt-1 text-xs text-chili-600">{fields.notes}</p>
              ) : null}
            </div>
          </div>

          {/* Opt-in location capture */}
          <div className="mt-4 rounded-xl border border-ink-900/10 bg-rice-200/40 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                  <MapPin className="size-4 text-plum-600" aria-hidden="true" />
                  {t("addresses.pinHeading")}
                </p>
                <p className="mt-0.5 text-xs text-ink-700/75">
                  {t("addresses.pinHint")}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={locating}
                onClick={captureLocation}
              >
                {coords ? t("addresses.updateLocation") : t("addresses.useMyLocation")}
              </Button>
            </div>

            <input
              type="hidden"
              name="latitude"
              value={coords ? String(coords.latitude) : ""}
            />
            <input
              type="hidden"
              name="longitude"
              value={coords ? String(coords.longitude) : ""}
            />
            <input
              type="hidden"
              name="accuracyM"
              value={coords?.accuracyM !== null && coords ? String(coords.accuracyM) : ""}
            />

            {coords ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-jade-600">
                <Check className="size-3.5" aria-hidden="true" />
                {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                {coords.accuracyM
                  ? t("addresses.errors.accuracySuffix", { meters: coords.accuracyM })
                  : ""}
              </p>
            ) : null}
            {locationError ? (
              <p role="status" className="mt-2 text-xs text-miso-600">
                {locationError}
              </p>
            ) : null}
            {fields.latitude || fields.longitude ? (
              <p className="mt-2 text-xs text-chili-600">
                {fields.latitude ?? fields.longitude}
              </p>
            ) : null}
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name="isDefault"
              defaultChecked={mode.kind === "edit" ? mode.address.is_default : true}
              className="size-4 accent-plum-600"
            />
            <span className="text-sm text-ink-800">{t("addresses.setDefault")}</span>
          </label>

          <div className="mt-4 flex gap-2">
            <Button type="submit" loading={saving}>
              {mode.kind === "edit" ? t("addresses.saveAddress") : t("addresses.addAddress")}
            </Button>
            <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function FormField({
  name,
  label,
  error,
  type = "text",
  required,
  defaultValue,
  placeholder,
  autoComplete,
  inputMode,
}: {
  name: string;
  label: string;
  error?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "tel" | "text";
}) {
  return (
    <div>
      <label htmlFor={`address-${name}`} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      <input
        id={`address-${name}`}
        name={name}
        type={type}
        inputMode={inputMode}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        className={cn(
          "mt-1.5 h-11 w-full rounded-xl border bg-rice-50 px-3 text-sm outline-none",
          error
            ? "border-chili-500/50 focus:border-chili-500"
            : "border-ink-900/12 focus:border-miso-500",
        )}
      />
      {error ? <p className="mt-1 text-xs text-chili-600">{error}</p> : null}
    </div>
  );
}
