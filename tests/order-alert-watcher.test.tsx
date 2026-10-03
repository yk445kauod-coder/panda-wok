import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderAlertWatcher } from "@/components/admin/order-alert-watcher";
import { I18nProvider } from "@/components/i18n-provider";
import { en } from "@/lib/i18n/dictionaries/en";
import type { OrderAlert } from "@/lib/sound/alert-state";

function render(pending: OrderAlert[]): string {
  return renderToStaticMarkup(
    <I18nProvider locale="en" dict={en}>
      <OrderAlertWatcher initialPending={pending} />
    </I18nProvider>,
  );
}

const order = (id: string, orderNumber: string): OrderAlert => ({
  id,
  orderNumber,
  createdAt: "2026-10-03T00:00:00Z",
});

/**
 * The alert bar is the visible half of the alarm; the siren is the audible
 * half. This proves the bar appears with a new order and disappears with none,
 * and that it offers the "Acknowledge" escape hatch.
 */
describe("order alert watcher", () => {
  it("renders nothing when there are no new orders", () => {
    expect(render([])).toBe("");
  });

  it("shows the alert bar with the order number and an acknowledge control", () => {
    const html = render([order("a", "PW-2609-1045")]);
    expect(html).toContain('role="alert"');
    expect(html).toContain("PW-2609-1045");
    expect(html).toContain("Acknowledge");
    // The order number links straight into the order.
    expect(html).toContain('href="/admin/orders/a"');
  });

  it("summarises several waiting orders and caps the chips", () => {
    const html = render([
      order("a", "PW-1"),
      order("b", "PW-2"),
      order("c", "PW-3"),
      order("d", "PW-4"),
    ]);
    expect(html).toContain("4 new orders are waiting");
    // Only the first three are shown as chips; the rest are counted.
    expect(html).toContain("+1");
  });
});
