"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Check, Loader2, MapPin, Navigation, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { Badge, Button, Spinner } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { PinCoords, ResolvedAddress } from "@/components/customer/location-map";
import { useErrorText, useT } from "@/components/i18n-provider";
import {
  deleteAddressAction,
  saveAddressAction,
  setDefaultAddressAction,
} from "@/lib/actions/account";
import { cn } from "@/lib/utils/format";
import {
  formatDetectedAddress,
  mergeDetectedAddress,
  type EditedFields,
  type ResolvedFields,
} from "@/lib/utils/address-fill";
import type { Address } from "@/lib/services/orders";

/** Leaflet + обратный геокодинг pulled in only when the map is actually opened. */
const LocationMapLazy = dynamic(
  () => import("@/components/customer/location-map").then((m) => m.LocationMap),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-rice-200" aria-hidden="true" /> },
);

type Mode = { kind: "closed" } | { kind: "new" } | { kind: "edit"; address: Address };

/** The kitchen's own city; the field is prefilled with it and localised. */
const DEFAULT_CITY = "Alexandria";

/**
 * Address book. Saving posts a FormData payload to the server action, which
 * re-validates every field with Zod. Location capture is opt-in: the browser
 * asks permission only when the customer presses the button, and the coordinates
 * are stored exactly as reported (never invented).
 */
export function AddressBook({ addresses }: { addresses: Address[] }) {
  const t = useT();
  const errorText = useErrorText();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "closed" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState<PinCoords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);
  // Pin-first flow: the customer drops or accepts a pin, confirms it, and only
  // then does the written address appear — prefilled from the pin where
  // OpenStreetMap knows the street. "Manual" skips the pin entirely.
  const [stage, setStage] = useState<"pin" | "details">("pin");
  const [manual, setManual] = useState(false);
  // Auto-detection: opening the form asks the browser for the current position
  // straight away instead of making the customer hunt for a button, and the pin
  // that comes back is the pin that is saved. This needs the user's permission,
  // so a refusal is silent — the map is still right there to drop a pin on, and
  // the typed-address path is untouched.
  const [detectState, setDetectState] = useState<"idle" | "detecting" | "done">("idle");
  const autoRan = useRef(false);
  // The map's reverse lookup reports the street/district/city it found for the
  // pin, which is shown beside the map so the customer can confirm it.
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);

  // The three fields the map can fill are controlled, not `defaultValue`.
  // The details step is not mounted while the customer is placing the pin, so a
  // lookup that wrote to `input[name=...]` wrote to nothing and every detected
  // address was discarded — the customer then had to retype it by hand. Holding
  // the values in state means the detected address is already in the fields the
  // moment they appear, and a pin moved while the details are open updates what
  // the customer is looking at.
  const [geo, setGeo] = useState<ResolvedFields>({ area: "", addressLine: "", city: "" });
  // Which of those fields the customer has typed in themselves. A pin moved
  // after that must not overwrite their own wording.
  const [edited, setEdited] = useState<EditedFields>({
    area: false,
    addressLine: false,
    city: false,
  });

  const pinConfirmed = coords !== null;
  const showDetails = manual || stage === "details";

  // Seed the fillable fields from the address being edited, or from the
  // kitchen's own city for a new one. Keyed on the mode so switching from one
  // address to another re-seeds, and adjusted during render (React's documented
  // "storing information from previous renders" pattern) rather than in an
  // effect, which avoids a second render pass and a flash of the previous
  // address. Everything else comes from OpenStreetMap — nothing is invented.
  const [seededMode, setSeededMode] = useState<Mode | null>(null);
  if (seededMode !== mode) {
    setSeededMode(mode);
    setEdited({ area: false, addressLine: false, city: false });
    setGeo({
      area: mode.kind === "edit" ? (mode.address.area ?? "") : "",
      addressLine: mode.kind === "edit" ? mode.address.address_line : "",
      city: mode.kind === "edit" ? (mode.address.city ?? DEFAULT_CITY) : DEFAULT_CITY,
    });
  }

  // The map resolves a pin to street/district/city. Write those into the fields
  // the customer is about to confirm, unless they have typed their own.
  useEffect(() => {
    const onReverse = (event: Event) => {
      const detail = (event as CustomEvent<ResolvedAddress>).detail;
      if (!detail) return;
      setResolvedAddress(detail);
      setGeo((prev) =>
        mergeDetectedAddress(
          prev,
          { area: detail.area, street: detail.street, city: detail.city },
          edited,
        ),
      );
    };
    window.addEventListener("panda-address-reverse", onReverse);
    return () => window.removeEventListener("panda-address-reverse", onReverse);
  }, [edited]);

  /**
   * Open the form for a brand-new address and start the location lookup. The
   * "detecting" status is set here, in the click handler, rather than in the
   * geolocation effect — that effect exists to subscribe to the browser API, and
   * a synchronous setState in its body would cascade renders.
   */
  function startNewAddress() {
    setDetectState("detecting");
    setMode({ kind: "new" });
  }

  function resetForm() {
    setMode({ kind: "closed" });
    setError(null);
    setFields({});
    setCoords(null);
    setLocationError(null);
    setMapKey((k) => k + 1);
    setStage("pin");
    setManual(false);
    setDetectState("idle");
    autoRan.current = false;
    setResolvedAddress(null);
    setGeo({ area: "", addressLine: "", city: DEFAULT_CITY });
    setEdited({ area: false, addressLine: false, city: false });
  }

  // Fire once, the first time the form is opened for a new address. Editing an
  // existing address never triggers it: that pin is the customer's own saved
  // position and must not be overwritten by wherever they happen to be now.
  //
  // `detectState` starts as "detecting" because the form only mounts this way
  // for a new address; the async callbacks then move it to "done" or "idle".
  // Setting it from the effect body would be a synchronous setState in an
  // effect, so the initial value carries that state instead.
  useEffect(() => {
    if (mode.kind !== "new") return;
    if (autoRan.current) return;
    autoRan.current = true;
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null,
        });
        setMapKey((k) => k + 1);
        setDetectState("done");
      },
      // A refusal or timeout is not an error the customer needs to read: the
      // map below is still the primary way to set the pin.
      () => setDetectState("idle"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, [mode.kind]);

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
        setMapKey((k) => k + 1);
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
      setError(errorText(result.error));
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
      setError(errorText(result.error));
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
      setError(errorText(result.error));
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
            <Button onClick={startNewAddress}>
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
                        setStage("details");
                        setManual(address.latitude === null);
                        autoRan.current = true;
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
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-600/8 disabled:opacity-50"
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
            <Button className="mt-4" onClick={startNewAddress}>
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

          {/* Pin first. The map, the GPS button and the confirmation all live
              above the fold of this card, and the written address only appears
              once the pin is confirmed (or the customer opts to type it). */}
          <div className="mt-4 rounded-xl border border-ink-900/10 bg-rice-200/40 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                  <MapPin className="size-4 text-indigo-600" aria-hidden="true" />
                  {t("addresses.pinHeading")}
                </p>
                <p className="mt-0.5 text-xs text-ink-700/75">
                  {t("addresses.pinHint")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setManual((m) => !m);
                  setStage("details");
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-600/8"
              >
                {manual ? t("addresses.useMapInstead") : t("addresses.enterManually")}
              </button>
            </div>

            {!manual ? (
              <div className="mt-3 space-y-2.5">
                <LocationMapLazy
                  key={mapKey}
                  coords={coords}
                  onChange={setCoords}
                  accuracyM={coords?.accuracyM ?? null}
                  locating={locating}
                  onLocate={() => void captureLocation()}
                  locateError={locationError}
                  disabled={saving}
                />

                {coords ? (
                  <p className="inline-flex items-center gap-1.5 text-xs text-jade-600">
                    <Check className="size-3.5" aria-hidden="true" />
                    {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                    {coords.accuracyM
                      ? t("addresses.errors.accuracySuffix", { meters: coords.accuracyM })
                      : ""}
                  </p>
                ) : detectState === "detecting" ? (
                  <p
                    role="status"
                    className="inline-flex items-center gap-1.5 text-xs text-ink-700/75"
                  >
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    {t("addresses.autoDetecting")}
                  </p>
                ) : (
                  <p className="text-xs text-ink-700/75">
                    {t("addresses.pinRequiredHint")}
                  </p>
                )}

                {/* What OpenStreetMap resolved the pin to, shown before the
                    customer confirms so the address they are about to save is
                    visible on the same screen as the pin. */}
                {coords && resolvedAddress && formatDetectedAddress(resolvedAddress) ? (
                  <p className="inline-flex items-start gap-1.5 text-xs text-ink-700/85">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-indigo-600" aria-hidden="true" />
                    <span>{formatDetectedAddress(resolvedAddress)}</span>
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!pinConfirmed || saving}
                    onClick={() => setStage("details")}
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                    {t("addresses.confirmPin")}
                  </Button>
                  {coords ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setCoords(null)}
                      disabled={saving}
                    >
                      {t("addresses.clearPin")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

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
              value={coords?.accuracyM != null ? String(coords.accuracyM) : ""}
            />
            {fields.latitude || fields.longitude ? (
              <p className="mt-2 text-xs text-chili-600">
                {fields.latitude ?? fields.longitude}
              </p>
            ) : null}
          </div>

          {/* Details appear once the location step is settled. Without a
              confirmed pin we require the written address instead, so a delivery
              is never left with no way to find the door. */}
          {showDetails ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                  value={geo.area}
                  onValueChange={(next) => {
                    setEdited((e) => ({ ...e, area: true }));
                    setGeo((g) => ({ ...g, area: next }));
                  }}
                  error={fields.area}
                />
                <div className="sm:col-span-2">
                  <FormField
                    name="addressLine"
                    label={t("addresses.fields.addressLine")}
                    value={geo.addressLine}
                    onValueChange={(next) => {
                      setEdited((e) => ({ ...e, addressLine: true }));
                      setGeo((g) => ({ ...g, addressLine: next }));
                    }}
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
                  value={geo.city}
                  onValueChange={(next) => {
                    setEdited((e) => ({ ...e, city: true }));
                    setGeo((g) => ({ ...g, city: next }));
                  }}
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

              <label className="mt-4 flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="isDefault"
                  defaultChecked={mode.kind === "edit" ? mode.address.is_default : true}
                  className="size-4 accent-indigo-600"
                />
                <span className="text-sm text-ink-800">{t("addresses.setDefault")}</span>
              </label>
            </>
          ) : null}

          <div className="mt-4 flex gap-2">
            <Button type="submit" loading={saving} disabled={!showDetails}>
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
  value,
  onValueChange,
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
  /** Supplying `value` makes the field controlled, which is how the map's
   *  reverse lookup lands in the form before the field is ever mounted. */
  value?: string;
  onValueChange?: (next: string) => void;
}) {
  const controlled = value !== undefined;
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
        {...(controlled
          ? { value, onChange: (e) => onValueChange?.(e.target.value) }
          : { defaultValue })}
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
