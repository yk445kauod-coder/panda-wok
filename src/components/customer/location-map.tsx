"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button, Spinner } from "@/components/ui/button";
import { useI18n, useT } from "@/components/i18n-provider";

/**
 * Map-based location picker for the address form.
 *
 * The customer drops a pin on an OpenStreetMap map (and may also tap "My
 * location" to get the browser's GPS fix). The coordinates are written back to
 * hidden fields, so the same addressSchema validation path as the typed form is
 * used — nothing new is invented client-side. Reverse geocoding (Nominatim)
 * is best-effort only: a district or street name may prefill the area/address
 * fields, but the customer always reads and confirms the result before saving.
 *
 * Privacy: nothing is sent anywhere until the customer presses "My
 * location" (geolocation API, browser-only); reverse lookup is one request to
 * OpenStreetMap's Nominatim (no key, no cookies sent by us), and the map itself
 * is purely visual — the customer's typed address stays authoritative.
 */

export type PinCoords = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
};

const ALEXANDRIA: [number, number] = [31.2001, 29.9187];

function MapEvents({
  onDropped,
  open,
}: {
  onDropped: (lat: number, lng: number) => void;
  open: boolean;
}) {
  // Only an explicit tap places the pin. Panning and zooming never move it, so
  // the customer can explore the map without losing the spot they chose.
  useMapEvents({
    click(e) {
      if (open) onDropped(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], Math.max(map.getZoom(), 16));
  }, [map, lat, lng]);
  return null;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export type ResolvedAddress = {
  area: string | null;
  street: string | null;
  city: string | null;
};

const lookupCache = new Map<string, ResolvedAddress>();

async function reverseGeocode(
  lat: number,
  lng: number,
  signal: AbortSignal,
  acceptLanguage: string,
): Promise<ResolvedAddress> {
  const key = cacheKey(lat, lng);
  if (lookupCache.has(key)) return lookupCache.get(key)!;

  try {
    const url = new URL(NOMINATIM_URL);
    url.search = new URLSearchParams({
      format: "jsonv2",
      lat: lat.toFixed(7),
      lon: lng.toFixed(7),
      zoom: "16",
      addressdetails: "1",
      // Street and district names are looked up in the reader's own language,
      // so an Arabic customer does not get Arabic labels over English place
      // names. This is the same address database either way.
      "accept-language": acceptLanguage,
    }).toString();

    const res = await fetch(url, { signal, headers: { "User-Agent": "panda-wok-web" } });
    if (!res.ok) throw new Error("reverse lookup failed");

    const data: {
      address?: {
        suburb?: string;
        neighbourhood?: string;
        city_district?: string;
        borough?: string;
        road?: string;
        pedestrian?: string;
        footway?: string;
        city?: string;
        town?: string;
        village?: string;
        state?: string;
      };
    } = await res.json();

    const result = {
      area:
        data.address?.neighbourhood ??
        data.address?.suburb ??
        data.address?.city_district ??
        data.address?.borough ??
        null,
      street:
        data.address?.road ??
        data.address?.pedestrian ??
        data.address?.footway ??
        null,
      city:
        data.address?.city ??
        data.address?.town ??
        data.address?.village ??
        data.address?.state ??
        null,
    };
    lookupCache.set(key, result);
    return result;
  } catch {
    return { area: null, street: null, city: null };
  }
}

export function LocationMap({
  coords,
  onChange,
  accuracyM,
  locating,
  onLocate,
  locateError,
  disabled,
}: {
  coords: PinCoords | null;
  onChange: (next: PinCoords) => void;
  accuracyM: number | null;
  locating: boolean;
  onLocate: () => void;
  locateError: string | null;
  disabled?: boolean;
}) {
  const t = useT();
  const { locale } = useI18n();
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const center: [number, number] = coords
    ? [coords.latitude, coords.longitude]
    : ALEXANDRIA;

  const handleDropped = useCallback(
    (lat: number, lng: number) => {
      onChange({ latitude: lat, longitude: lng, accuracyM: null });
    },
    [onChange],
  );

  // Best-effort reverse lookup to prefill area/district/street. Runs whenever
  // the pin settles somewhere new, and is cancellable so a customer dragging the
  // pin does not queue up lookups.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (!coords) return;
    const key = `${coords.latitude},${coords.longitude}`;
    if (previous.current === key) return;
    previous.current = key;

    // Supersede any in-flight lookup rather than skipping this one: an earlier
    // `if (searching) return` recorded the position as seen but never fetched
    // it, so a pin moved mid-lookup was never resolved at all.
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setSearching(true);

    void reverseGeocode(coords.latitude, coords.longitude, controller.signal, locale)
      .then((result) => {
        if (controller.signal.aborted) return;
        // The parent fills the area/address/city fields from this event.
        window.dispatchEvent(
          new CustomEvent("panda-address-reverse", {
            detail: { ...result, latitude: coords.latitude, longitude: coords.longitude },
          }),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
  }, [coords, locale]);

  return (
    <div
      className="location-map isolate relative z-0 h-56 w-full overflow-hidden rounded-xl border border-ink-900/12"
      data-reduced-motion="protected"
    >
      <MapContainer
        center={center}
        zoom={coords ? 16 : 13}
        scrollWheelZoom={false}
        className="h-full w-full"
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEvents onDropped={handleDropped} open={!disabled} />
        {coords ? <FlyTo lat={coords.latitude} lng={coords.longitude} /> : null}
        {coords ? (
          <Marker
            position={[coords.latitude, coords.longitude]}
            draggable={!disabled}
            eventHandlers={{
              dragend: (e) => {
                const pos = (e.target as L.Marker).getLatLng();
                handleDropped(pos.lat, pos.lng);
              },
            }}
            icon={
              new L.DivIcon({
                className: "location-pin",
                html: `<span class="location-pin-core"></span>`,
                iconSize: [28, 28],
                iconAnchor: [14, 28],
              })
            }
          />
        ) : null}
      </MapContainer>

      {/* Pin hint; map interactions only when a pin exists */}
      {!coords ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
          <p className="rounded-full border border-ink-900/10 bg-rice-50/92 px-3 py-1.5 text-[11px] font-medium text-ink-700 shadow-washi backdrop-blur-sm">
            <MapPin className="me-1 inline size-3.5 text-indigo-600" aria-hidden="true" />
            {t("addresses.map.dropPinHint")}
          </p>
        </div>
      ) : null}

      {/* How sure the device is about the pin it just reported. Shown only for a
          located pin — a hand-dropped pin has no accuracy to speak of. */}
      {coords && accuracyM ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
          <p className="rounded-full border border-ink-900/10 bg-rice-50/92 px-3 py-1.5 text-[11px] font-medium text-ink-700 shadow-washi backdrop-blur-sm">
            <MapPin className="me-1 inline size-3.5 text-jade-600" aria-hidden="true" />
            {t("addresses.map.accuracy", { meters: accuracyM })}
          </p>
        </div>
      ) : null}

      <div className="absolute bottom-2 end-2 flex flex-col items-end gap-1.5">
        {searching ? (
          <div className="flex items-center gap-1.5 rounded-full border border-ink-900/10 bg-rice-50/92 px-2.5 py-1.5 text-[11px] text-ink-700 shadow-washi backdrop-blur-sm">
            <Spinner className="size-3.5" />
            {t("addresses.map.resolving")}
          </div>
        ) : locating ? (
          <div className="flex items-center gap-1.5 rounded-full border border-ink-900/10 bg-rice-50/92 px-2.5 py-1.5 text-[11px] text-ink-700 shadow-washi backdrop-blur-sm">
            <Spinner className="size-3.5" />
            {t("addresses.map.locating")}
          </div>
        ) : locateError ? (
          <p role="status" className="rounded-full border border-chili-500/20 bg-rice-50/95 px-2.5 py-1 text-[11px] text-chili-600 shadow-washi">
            {locateError}
          </p>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLocate}
          disabled={disabled || locating}
          className="shadow-washi"
        >
          <Navigation className="size-3.5" aria-hidden="true" />
          {t("addresses.useMyLocation")}
        </Button>
      </div>
    </div>
  );
}
