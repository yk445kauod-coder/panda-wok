import { cn } from "@/lib/utils/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-rice-50 hover:bg-indigo-700 active:bg-indigo-700 shadow-washi",
  secondary:
    "bg-bamboo-600 text-rice-50 hover:bg-bamboo-700 active:bg-bamboo-700 shadow-washi",
  outline:
    "border border-ink-900/15 bg-rice-50/70 text-ink-900 hover:bg-rice-100",
  ghost: "text-ink-800 hover:bg-ink-900/5",
  danger: "bg-chili-500 text-rice-50 hover:bg-chili-600",
};

const SIZES: Record<Size, string> = {
  // Minimum 36px tall with 44px of touch area via padding on mobile layouts.
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "h-11 px-4 text-sm rounded-xl gap-2",
  lg: "h-13 px-6 text-base rounded-xl gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  loading = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("animate-spin", className)}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "indigo";
  className?: string;
}) {
  const tones = {
    neutral: "bg-ink-900/8 text-ink-700",
    success: "bg-jade-500/15 text-jade-600",
    warning: "bg-miso-500/20 text-miso-600",
    danger: "bg-chili-500/15 text-chili-600",
    info: "bg-bamboo-500/18 text-bamboo-700",
    indigo: "bg-indigo-600/12 text-indigo-600",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
