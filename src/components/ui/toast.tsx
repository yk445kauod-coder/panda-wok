"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils/format";

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
};

type ToastApi = {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<ToastTone, { wrap: string; icon: React.ReactNode }> = {
  success: {
    wrap: "border-jade-500/35 bg-jade-500/12 text-jade-600",
    icon: <Check className="size-4 shrink-0" aria-hidden="true" />,
  },
  error: {
    wrap: "border-chili-500/35 bg-chili-500/12 text-chili-600",
    icon: <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />,
  },
  info: {
    wrap: "border-ink-900/15 bg-rice-50 text-ink-800",
    icon: <Info className="size-4 shrink-0" aria-hidden="true" />,
  },
};

let nextId = 1;

/**
 * Single live region for transient feedback. Before this, every form rendered
 * its own inline status paragraph, so a mutation from a row (toggle, delete)
 * had nowhere to report success.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-2), { id, tone, message }]);
      if (typeof window !== "undefined") {
        window.setTimeout(() => dismiss(id), 4500);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (message: string) => toast(message, "success"),
      error: (message: string) => toast(message, "error"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 pb-safe sm:items-end"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border p-3 text-sm shadow-washi",
              "animate-rise",
              TONES[item.tone].wrap,
            )}
          >
            {TONES[item.tone].icon}
            <p className="min-w-0 flex-1">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (context) return context;
  // Rendering outside the provider must never crash a mutation; fall back to
  // the console so the failure is still observable in development.
  return {
    toast: () => undefined,
    success: () => undefined,
    error: () => undefined,
  };
}
