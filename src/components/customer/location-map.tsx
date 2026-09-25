"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Navigation, RefreshCw, Search, X } from "lucide-react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button, Spinner } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

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

const lookupCache = new Map<string, { area: string | null; street: string | null }>();

async function reverseGeocode(
  lat: number,
  lng: number,
  signal: AbortSignal,
): Promise<{ area: string | null; street: string | null }> {
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
      "accept-language": "en",
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
    };
    lookupCache.set(key, result);
    return result;
  } catch {
    return { area: null, street: null };
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

  // Best-effort reverse lookup to prefill area/district/street. Only runs when
  // the pin moves, never automatically at mount, and is cancellable if the
  // customer keeps dragging.

  const previous = useRef<PinCoords | null>(null);
  useEffect(() => {
    if (!coords) return;
    if (previous.current && previous.current.latitude === coords.latitude && previous.current.longitude === coords.longitude) {
      return;
    }
    previous.current = coords;

    if (searching) return;

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setSearching(true);

    void reverseGeocode(coords.latitude, coords.longitude, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.area || result.street) {
          onChange({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracyM: coords.accuracyM,
          });
        }
        // The parent fills the area/address fields from a small event; full
        // population is done by the form via the onReverse callback.
        window.dispatchEvent(
          new CustomEvent("panda-address-reverse", {
            detail: { ...result, latitude: coords.latitude, longitude: coords.longitude },
          }),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
  }, [coords, searching, onChange]);

  return (
    <div
      className="location-map relative h-56 w-full overflow-hidden rounded-xl border border-ink-900/12"
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
            <MapPin className="me-1 inline size-3.5 text-plum-600" aria-hidden="true" />
            {t("addresses.map.dropPinHint")}
          </p>
        </div>
      ) : null}

      <div className="absolute bottom-2 end-2 flex flex-col items-end gap-1.5">
        {locating ? (
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

/**
 * An inline "search a place" affordance. Nominatim also does search; this is
 * a keyboard-first alternative to dragging the pin (type a street/area, then
 * tap a result and the pin snaps there).
 */
export function LocationSearch({
  onPick,
  disabled,
}: {
  onPick: (lat: number, lng: number) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ lat: number; lon: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    abortRef.current?.abort();
  }, []);

  async function run(q: string) {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setBusy(true);

    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.search = new URLSearchParams({
        format: "jsonv2",
        q: q.trim(),
        countrycodes: "eg",
        limit: "5",
        "accept-language": "en",
      }).toString();
      const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "panda-wok-web" } });
      if (!res.ok) throw new Error("search failed");
      const data: { lat: string; lon: string; display_name: string }[] = await res.json();
      setResults(
        data.map((d) => ({
          lat: parseFloat(d.lat),
          lon: parseFloat(d.lon),
          name: d.display_name,
        })),
      );
    } catch {
      // ignore; the map + typed address remain the way in.
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function onInput(value: string) {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(value), 450);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-700/60" aria-hidden="true" />
        <input
          type="text"
          inputMode="search"
          value={q}
          onChange={(e) => onInput(e.target.value)}
          disabled={disabled}
          placeholder={t("addresses.map.searchPlaceholder")}
          aria-label={t("addresses.map.searchPlaceholder")}
          className="h-10 w-full rounded-xl border border-ink-900/12 bg-rice-50 pe-3 ps-9 text-sm outline-none focus:border-miso-500 disabled:opacity-60"
        />
        {q ? (
          <button
            type="button"
            aria-label={t("addresses.clearSearch")}
            onClick={() => {
              setQ("");
              setResults([]);
            }}
            className="absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-700/60 hover:bg-rice-200"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {busy ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-700/70">
          <Spinner className="size-3" />
          {t("addresses.map.searching")}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="absolute inset-x-0 z-10 mt-1 overflow-hidden rounded-xl border border-ink-900/10 bg-rice-50 shadow-washi-lg">
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lon}-${i}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-ink-800 hover:bg-rice-200"
                onClick={() => {
                  onPick(r.lat, r.lon);
                  setQ(r.name.split(",")[0]?.trim() ?? r.name);
                  setResults([]);
                }}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-plum-600" aria-hidden="true" />
                <span className="line-clamp-2">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}