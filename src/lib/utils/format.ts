import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_CURRENCY = "EGP";
const formatters = new Map<string, Intl.NumberFormat>();

/** Formatters are cached because constructing one per row is measurably slow. */
function currencyFormatter(currency: string) {
  const existing = formatters.get(currency);
  if (existing) return existing;

  const formatter = new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  formatters.set(currency, formatter);
  return formatter;
}

export function formatPrice(
  value: number | string | null | undefined,
  currency: string = DEFAULT_CURRENCY,
) {
  const n = typeof value === "string" ? Number(value) : value;
  const formatter = currencyFormatter(currency);
  if (n === null || n === undefined || Number.isNaN(n)) return formatter.format(0);
  return formatter.format(n);
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "0";
  return new Intl.NumberFormat("en-EG").format(value);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatRelative(value: string | Date | null | undefined) {
  if (!value) return "never";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "never";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 1) return "just now";
  if (Math.abs(mins) < 60) return mins > 0 ? `${mins}m ago` : `in ${-mins}m`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `${hours}h ago` : `in ${-hours}h`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return days > 0 ? `${days}d ago` : `in ${-days}d`;
  return formatDate(d);
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/** Human label for an arbitrary snake_case enum value coming from the DB. */
export function humanise(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Clock time for chat bubbles, locale-aware but short. */
export function formatTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}


export function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Stable, non-cryptographic id for idempotency keys and client session ids. */
export function randomId(prefix = "") {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}-${rand}` : rand;
}

export function safeJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  return value as T;
}
