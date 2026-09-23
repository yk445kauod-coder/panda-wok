import { cn } from "@/lib/utils/format";

/**
 * The one card wrapper. `.washi-panel` was previously re-composed by hand in
 * 80+ places with drifted padding and hover treatments; this fixes the
 * vocabulary to three shapes.
 */
export function Card({
  as: Tag = "div",
  interactive = false,
  padded = true,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "li";
  interactive?: boolean;
  padded?: boolean;
}) {
  return (
    <Tag
      {...props}
      className={cn(
        "washi-panel",
        padded && "p-4 sm:p-5",
        interactive &&
          "block transition-shadow hover:shadow-washi-lg focus-visible:shadow-washi-lg",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Section heading + optional description and trailing action. */
export function CardHeader({
  title,
  description,
  action,
  className,
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold text-ink-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-ink-700/80">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
