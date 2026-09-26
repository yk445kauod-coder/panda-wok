"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CartLine = {
  menuItemId: string;
  slug: string;
  name: string;
  nameAr: string | null;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  hasTransparentPng: boolean;
  modifiers: { id: string; name: string; priceDelta: number }[];
  notes?: string;
  /** Snapshot of availability at the time of adding, for stale-cart warnings. */
  maxQuantity: number;
};

const STORAGE_KEY = "panda-wok.cart.v1";

type CartContextValue = {
  lines: CartLine[];
  hydrated: boolean;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (menuItemId: string, quantity: number) => void;
  remove: (menuItemId: string) => void;
  clear: () => void;
  subtotal: number;
  itemCount: number;
  priceOf: (line: CartLine) => number;
};

const CartContext = createContext<CartContextValue | null>(null);

/** Modifier selection is part of a line's identity: same dish, different extras. */
function lineKey(menuItemId: string, modifiers: CartLine["modifiers"]) {
  const ids = modifiers.map((m) => m.id).sort().join(",");
  return `${menuItemId}::${ids}`;
}

function readStored(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Validate shape defensively: stored data may predate a schema change.
    return parsed.filter((line): line is CartLine => {
      if (!line || typeof line !== "object") return false;
      const l = line as Partial<CartLine>;
      return (
        typeof l.menuItemId === "string" &&
        typeof l.slug === "string" &&
        typeof l.name === "string" &&
        typeof l.unitPrice === "number" &&
        typeof l.quantity === "number" &&
        l.quantity > 0 &&
        Array.isArray(l.modifiers)
      );
    });
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Read synchronously on first render. The provider only ever renders on the
  // client, so this avoids a flash of an empty basket and the extra render that
  // an effect-based load would cause. `hydrated` stays false when there is
  // genuinely nothing stored yet.
  const [lines, setLines] = useState<CartLine[]>(() => readStored());
  const [hydrated] = useState(true);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Quota or private mode: the in-memory cart still works for this session.
    }
  }, [lines, hydrated]);

  // Keep multiple open tabs consistent.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) setLines(readStored());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setLines((current) => {
      const key = lineKey(line.menuItemId, line.modifiers);
      const index = current.findIndex(
        (l) => lineKey(l.menuItemId, l.modifiers) === key,
      );
      const cap = Math.min(line.maxQuantity || 20, 100);
      if (index >= 0) {
        const next = [...current];
        next[index] = {
          ...next[index],
          quantity: Math.min(next[index].quantity + quantity, cap),
        };
        return next;
      }
      return [...current, { ...line, quantity: Math.min(quantity, cap) }];
    });
  }, []);

  const setQuantity = useCallback((menuItemId: string, quantity: number) => {
    setLines((current) =>
      current
        .map((line) =>
          line.menuItemId === menuItemId
            ? {
                ...line,
                quantity: Math.max(
                  0,
                  Math.min(quantity, line.maxQuantity || 20, 100),
                ),
              }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }, []);

  const remove = useCallback((menuItemId: string) => {
    setLines((current) => current.filter((l) => l.menuItemId !== menuItemId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const priceOf = useCallback(
    (line: CartLine) =>
      Math.round(
        (line.unitPrice +
          line.modifiers.reduce((m, mod) => m + mod.priceDelta, 0)) *
          line.quantity *
          100,
      ) / 100,
    [],
  );

  const subtotal = useMemo(
    () => Math.round(lines.reduce((sum, line) => sum + priceOf(line), 0) * 100) / 100,
    [lines, priceOf],
  );

  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  );

  const value = useMemo(
    () => ({
      lines,
      hydrated,
      add,
      setQuantity,
      remove,
      clear,
      subtotal,
      itemCount,
      priceOf,
    }),
    [lines, hydrated, add, setQuantity, remove, clear, subtotal, itemCount, priceOf],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
