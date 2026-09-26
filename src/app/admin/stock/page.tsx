import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import {
  listStockItems,
  listStockMovements,
  type AdminStockItem,
} from "@/lib/services/admin-catalog";
import { StockItemForm, StockMovementForm } from "@/components/admin/stock-forms";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatNumber, formatRelative, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  ok: "success",
  low: "warning",
  out: "danger",
} as const;

type MovementRow = {
  id: number;
  direction: string;
  quantity: number;
  reason: string | null;
  created_at: string;
  stock_items: { name_en: string; unit: string } | null;
};

/**
 * Stock control. The summary, the item list and the movement log all read the
 * same source, so the counts never drift from the rows beneath them.
 */
export default async function AdminStockPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireCapability("stock.manage");
  const params = await searchParams;

  const [items, movements] = await Promise.all([
    listStockItems(),
    listStockMovements(undefined, 25),
  ]);

  const editing: AdminStockItem | null = params.edit
    ? (items.find((item) => item.id === params.edit) ?? null)
    : null;

  const counts = {
    ok: items.filter((item) => item.status === "ok").length,
    low: items.filter((item) => item.status === "low").length,
    out: items.filter((item) => item.status === "out").length,
  };

  const options = items.map((item) => ({
    id: item.id,
    name_en: item.name_en,
    unit: item.unit,
  }));

  const recentMovements = movements as unknown as MovementRow[];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Stock</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Counts update from supplier deliveries, kitchen usage and stock takes. Every
            change is logged below.
          </p>
        </div>
        {params.edit ? (
          <Link
            href="/admin/stock"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            Add new item
          </Link>
        ) : null}
      </header>

      <section aria-label="Stock summary" className="grid gap-3 sm:grid-cols-3">
        <div className="washi-panel p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-700/60">OK</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-jade-600">
            {formatNumber(counts.ok)}
          </p>
          <p className="text-xs text-ink-700/70">Above the reorder threshold</p>
        </div>
        <div className="washi-panel p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-700/60">Low</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-miso-600">
            {formatNumber(counts.low)}
          </p>
          <p className="text-xs text-ink-700/70">At or below threshold</p>
        </div>
        <div className="washi-panel p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-700/60">
            Out
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-chili-600">
            {formatNumber(counts.out)}
          </p>
          <p className="text-xs text-ink-700/70">Linked dishes may be hidden</p>
        </div>
      </section>

      <section aria-label="Stock items">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">
          Items{" "}
          <span className="text-sm font-normal text-ink-700/60">
            ({formatNumber(items.length)})
          </span>
        </h2>

        {items.length === 0 ? (
          <EmptyState
            title="No stock items yet"
            description="Add the ingredients and consumables you track — for example chicken thigh, jasmine rice or chilli oil."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const tone = STATUS_TONE[item.status];
              const flagged = item.status !== "ok";
              return (
                <li
                  key={item.id}
                  className={cn(
                    "washi-panel p-3",
                    flagged && "border-miso-500/40 bg-miso-300/10",
                  )}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink-900">
                          {item.name_en}
                        </span>
                        {item.name_ar ? (
                          <span className="text-xs text-ink-700/70" dir="rtl">
                            {item.name_ar}
                          </span>
                        ) : null}
                        <Badge tone={tone}>{humanise(item.status)}</Badge>
                        {item.auto_link_availability ? (
                          <Badge tone="info">Auto links dishes</Badge>
                        ) : null}
                      </div>

                      <p className="mt-1 text-xs text-ink-800">
                        <span className="font-medium tabular-nums text-ink-900">
                          {formatNumber(item.quantity)} {item.unit}
                        </span>{" "}
                        on hand · reorder at{" "}
                        <span className="tabular-nums">
                          {formatNumber(item.min_threshold)} {item.unit}
                        </span>
                        {" · "}
                        {formatNumber(item.linked_items)}{" "}
                        {item.linked_items === 1 ? "linked dish" : "linked dishes"}
                      </p>

                      <p className="mt-0.5 text-xs text-ink-700/70">
                        {item.supplier ? `${item.supplier} · ` : ""}
                        updated {formatRelative(item.last_updated_at)}
                      </p>

                      {item.notes ? (
                        <p className="mt-1 rounded-lg bg-rice-200/60 px-2.5 py-1.5 text-xs text-ink-800">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>

                    <Link
                      href={`/admin/stock?edit=${item.id}`}
                      className="inline-flex h-9 shrink-0 items-center rounded-lg border border-ink-900/15 bg-rice-50/70 px-3 text-sm font-medium text-ink-900 hover:bg-rice-100"
                    >
                      Edit
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          className="washi-panel p-4"
          aria-label={editing ? "Edit stock item" : "Add a stock item"}
        >
          <h2 className="font-display text-lg font-semibold text-ink-900">
            {editing ? `Edit ${editing.name_en}` : "Add a stock item"}
          </h2>
          <p className="mt-1 text-sm text-ink-700/75">
            {editing
              ? "Saving here overwrites the on-hand count directly. Prefer the movement form for day-to-day changes."
              : "Set the starting count and the threshold at which the item reads as low."}
          </p>
          <div className="mt-4">
            <StockItemForm item={editing} />
          </div>
        </section>

        <section className="washi-panel p-4" aria-label="Record a stock movement">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Record a movement
          </h2>
          <p className="mt-1 text-sm text-ink-700/75">
            Stock in, stock out or an adjustment. A movement can automatically make linked
            dishes unavailable when stock runs out — staff can always override a dish by
            hand in the Menu CMS.
          </p>
          <div className="mt-4">
            <StockMovementForm items={options} />
          </div>
        </section>
      </div>

      <section aria-label="Recent stock movements">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">
          Recent movements
        </h2>

        {recentMovements.length === 0 ? (
          <EmptyState
            title="No movements recorded"
            description="Movements appear here as soon as deliveries, usage or stock takes are logged."
          />
        ) : (
          <>
            {/* Phone layout: one card per movement. */}
            <ul className="space-y-2 lg:hidden">
              {recentMovements.map((movement) => (
                <li key={movement.id} className="washi-panel p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-900">
                      {movement.stock_items?.name_en ?? "Unknown item"}
                    </span>
                    <Badge
                      tone={
                        movement.direction === "in"
                          ? "success"
                          : movement.direction === "out"
                            ? "danger"
                            : "info"
                      }
                    >
                      {humanise(movement.direction)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-800 tabular-nums">
                    {formatNumber(movement.quantity)}{" "}
                    {movement.stock_items?.unit ?? ""} · {formatRelative(movement.created_at)}
                  </p>
                  {movement.reason ? (
                    <p className="mt-0.5 text-xs text-ink-700/70">{movement.reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>

            {/* Wider screens: a real table with column headers. */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <caption className="sr-only">
                  The 25 most recent stock movements, newest first.
                </caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-700/60">
                    <th scope="col" className="px-3 py-2 font-medium">
                      Item
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Direction
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Quantity
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Reason
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentMovements.map((movement) => (
                    <tr key={movement.id} className="border-t border-ink-900/8">
                      <td className="px-3 py-2 text-ink-900">
                        {movement.stock_items?.name_en ?? "Unknown item"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            movement.direction === "in"
                              ? "success"
                              : movement.direction === "out"
                                ? "danger"
                                : "info"
                          }
                        >
                          {humanise(movement.direction)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-900">
                        {formatNumber(movement.quantity)}{" "}
                        {movement.stock_items?.unit ?? ""}
                      </td>
                      <td className="px-3 py-2 text-ink-700/80">
                        {movement.reason ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-ink-700/70">
                        {formatRelative(movement.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
