"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils/format";
import { playTing } from "@/lib/sound/ting";

export type ConfirmTone = "question" | "warning" | "danger" | "success";

export type ConfirmOptions = {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** A destructive confirm can chime once it succeeds. Off by default. */
  sound?: boolean;
};

type DialogState = ConfirmOptions & {
  resolve: (value: boolean) => void;
  kind: "confirm" | "alert";
};

type ConfirmApi = {
  /** Modal yes/no. Resolves false on Escape, backdrop or Cancel. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Modal acknowledgement with a single button. */
  alert: (options: ConfirmOptions) => Promise<void>;
};

const ConfirmContext = createContext<ConfirmApi | null>(null);

const TONES: Record<
  ConfirmTone,
  { icon: React.ReactNode; ring: string; button: string }
> = {
  question: {
    icon: <Info className="size-6 text-vermilion-600" aria-hidden="true" />,
    ring: "bg-vermilion-600/12",
    button: "bg-vermilion-600 hover:bg-vermilion-700 text-rice-50",
  },
  warning: {
    icon: <AlertTriangle className="size-6 text-miso-600" aria-hidden="true" />,
    ring: "bg-miso-500/15",
    button: "bg-miso-600 hover:bg-miso-700 text-rice-50",
  },
  danger: {
    icon: <AlertTriangle className="size-6 text-chili-600" aria-hidden="true" />,
    ring: "bg-chili-500/12",
    button: "bg-chili-600 hover:bg-chili-700 text-rice-50",
  },
  success: {
    icon: <Check className="size-6 text-jade-600" aria-hidden="true" />,
    ring: "bg-jade-500/12",
    button: "bg-jade-600 hover:bg-jade-700 text-rice-50",
  },
};

/**
 * SweetAlert-style confirm/alert for the console. Native `window.confirm` is a
 * grey browser box with no tone, no title and no styling, and `window.prompt`
 * cannot be themed at all — which is why destructive actions here were easy to
 * fire by accident. This renders inside the app, dims the page, traps focus on
 * the primary button, and resolves a promise so call sites read linearly.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const settle = useCallback((value: boolean) => {
    setDialog((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setDialog({ ...options, tone: options.tone ?? "question", resolve, kind: "confirm" });
      }),
    [],
  );

  const alert = useCallback(
    (options: ConfirmOptions) =>
      new Promise<void>((resolve) => {
        setDialog({
          ...options,
          tone: options.tone ?? "question",
          resolve: () => resolve(),
          kind: "alert",
        });
      }),
    [],
  );

  const api = useMemo<ConfirmApi>(() => ({ confirm, alert }), [confirm, alert]);

  useEffect(() => {
    if (!dialog) return;
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, settle]);

  const tone = TONES[dialog?.tone ?? "question"];

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {dialog ? (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4">
          <button
            type="button"
            aria-label={dialog.cancelLabel ?? "Close"}
            onClick={() => settle(false)}
            className="absolute inset-0 bg-ink-950/45 backdrop-blur-sm"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="animate-rise relative w-full max-w-sm rounded-2xl border border-ink-900/10 bg-rice-50 p-5 text-center shadow-2xl"
          >
            <span
              className={cn(
                "mx-auto grid size-12 place-items-center rounded-full",
                tone.ring,
              )}
            >
              {tone.icon}
            </span>
            <h2
              id="confirm-title"
              className="mt-3 font-display text-lg font-semibold text-ink-900"
            >
              {dialog.title}
            </h2>
            {dialog.text ? (
              <p className="mt-1.5 text-sm leading-relaxed text-ink-700/85">{dialog.text}</p>
            ) : null}
            <div className={cn("mt-5 flex gap-2", dialog.kind === "alert" && "justify-center")}>
              {dialog.kind === "confirm" ? (
                <button
                  type="button"
                  onClick={() => settle(false)}
                  className="h-10 flex-1 rounded-xl border border-ink-900/15 bg-rice-50 text-sm font-medium text-ink-800 transition-colors hover:bg-rice-100"
                >
                  {dialog.cancelLabel ?? "Cancel"}
                </button>
              ) : null}
              <button
                ref={primaryRef}
                type="button"
                onClick={() => {
                  if (dialog.sound) playTing();
                  settle(true);
                }}
                className={cn(
                  "h-10 rounded-xl px-4 text-sm font-semibold transition-colors",
                  dialog.kind === "confirm" ? "flex-1" : "min-w-32",
                  tone.button,
                )}
              >
                {dialog.confirmLabel ?? "Confirm"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => settle(false)}
              aria-label={dialog.cancelLabel ?? "Cancel"}
              className="absolute end-3 top-3 rounded-lg p-1 text-ink-600 transition-colors hover:bg-ink-900/6"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmApi {
  const context = useContext(ConfirmContext);
  if (context) return context;
  // Outside the provider, fall back to the native dialogs so a mutation is
  // never silently unguarded.
  return {
    confirm: async (options) =>
      typeof window === "undefined" ? false : window.confirm(options.title),
    alert: async (options) => {
      if (typeof window !== "undefined") window.alert(options.title);
    },
  };
}
