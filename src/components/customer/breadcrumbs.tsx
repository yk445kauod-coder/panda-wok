import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Accessible breadcrumb trail. Reused on every nested public page, and the
 * same items feed the BreadcrumbList structured data.
 */
export function Breadcrumbs({
  items,
}: {
  items: { name: string; path: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-700/70">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.path} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="font-medium text-ink-800">
                  {item.name}
                </span>
              ) : (
                <>
                  <Link href={item.path} className="hover:text-ink-900">
                    {item.name}
                  </Link>
                  <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
