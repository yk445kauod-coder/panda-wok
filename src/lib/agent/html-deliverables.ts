import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getDashboardMetrics, collectInsightData } from "@/lib/crm/insights";
import { getCrmStats, segmentOverview, listCrmCustomers } from "@/lib/crm/customers";
import {
  barChart,
  donutChart,
  gaugeRows,
  rankedBarChart,
  emptyChart,
} from "@/lib/agent/charts";
import {
  htmlDocument,
  escapeHtml,
  kpiGrid,
  dataTable,
  note,
  section,
  slide,
} from "@/lib/agent/html";

/**
 * HTML deliverables: the documents a human opens, presents or prints.
 *
 * Same contract as the markdown deliverables — every figure comes from a live
 * query and is computed in code, never written by a model — but rendered as a
 * self-contained page with charts. The distinction that matters for correctness:
 * a chart is a *view* of numbers the renderer already has, so a chart cannot
 * introduce a figure the tables do not also state.
 */

export type HtmlDeliverableKind =
  | "sales_dashboard"
  | "crm_summary"
  | "users_report"
  | "inventory_report"
  | "slide_deck"
  | "strategy_brief";

export type RenderedHtmlDeliverable = {
  kind: HtmlDeliverableKind;
  title: string;
  summary: string;
  body: string;
  rowCount: number;
  data: Record<string, unknown>;
};

const fmtEgp = (n: number) => `${n.toFixed(2)} EGP`;
const fmtInt = (n: number) => n.toFixed(0);
const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

/* ------------------------------------------------------------------ 1. sales dashboard */

/**
 * The statistics page with charts: revenue trend, status mix, category mix,
 * top dishes and stock warnings, all from one dashboard query.
 */
export async function salesDashboard(): Promise<RenderedHtmlDeliverable> {
  const m = await getDashboardMetrics(30);
  const insight = await collectInsightData(30).catch(() => null);

  const revenueSeries = m.revenueByDay.map((d) => ({ label: d.day.slice(5), value: d.revenue }));
  const statusSeries = m.statusBreakdown.map((s) => ({ label: s.status, value: s.count }));
  const categorySeries = m.categoryMix.slice(0, 8).map((c) => ({ label: c.category, value: c.revenue }));
  const topSeries = m.topItems.slice(0, 10).map((t) => ({ label: t.name, value: t.revenue }));
  const ratingSeries = m.feedbackSummary.distribution.map((d) => ({
    label: `${d.rating}★`,
    value: d.count,
  }));

  const sections = [
    section(
      "نظرة عامة",
      kpiGrid([
        { label: "إجمالي الطلبات (30 يوم)", value: fmtInt(m.ordersInWindow) },
        { label: "طلبات اليوم", value: fmtInt(m.ordersToday) },
        { label: "الإيرادات (المكتملة)", value: fmtEgp(m.revenueInWindow) },
        { label: "متوسط قيمة الطلب", value: fmtEgp(m.avgOrderValue) },
        { label: "عملاء جدد", value: fmtInt(m.newCustomers) },
        { label: "عملاء عائدون", value: fmtInt(m.returningCustomers) },
        { label: "طلبات ملغاة", value: fmtInt(m.canceledOrders) },
        { label: "متوسط التقييم", value: m.feedbackSummary.count > 0 ? `${m.feedbackSummary.averageRating.toFixed(2)} / 5` : "—" },
      ]),
    ),
    section(
      "الإيرادات يوم بيوم",
      m.revenueByDay.length === 0
        ? emptyChart("لا توجد إيرادات مسجّلة في آخر 30 يوم.")
        : barChart(revenueSeries, { valueFormat: fmtEgp, title: "الإيرادات يوم بيوم" }) +
          note(
            `إجمالي الفترة ${fmtEgp(m.revenueInWindow)} من ${m.ordersInWindow} طلب. الإيراد يُحتسب من الطلبات المكتملة فقط.`,
          ),
    ),
    section(
      "توزيع حالات الطلبات",
      statusSeries.length === 0
        ? emptyChart("لا توجد طلبات في هذه الفترة.")
        : donutChart(statusSeries, { title: "حالات الطلبات", valueFormat: fmtInt }),
    ),
    section(
      "توزيع الفئات",
      categorySeries.length === 0
        ? emptyChart("لا توجد أصناف مبيعة في هذه الفترة.")
        : rankedBarChart(categorySeries, { valueFormat: fmtEgp, title: "الإيراد حسب الفئة" }),
    ),
    section(
      "أعلى الأصناف",
      topSeries.length === 0
        ? emptyChart("لا توجد أصناف مبيعة في هذه الفترة.")
        : rankedBarChart(topSeries, { valueFormat: fmtEgp, title: "أعلى الأصناف إيرادًا" }) +
          dataTable(
            [
              { key: "name", label: "الصنف" },
              { key: "quantity", label: "الكمية", numeric: true },
              { key: "revenue", label: "الإيراد", numeric: true },
            ],
            m.topItems.slice(0, 15).map((t) => ({
              name: t.name,
              quantity: t.quantity,
              revenue: fmtEgp(t.revenue),
            })),
          ),
    ),
    section(
      "تقييم العملاء",
      m.feedbackSummary.count === 0
        ? emptyChart("لا يوجد تقييمات عامة بعد.")
        : donutChart(ratingSeries, { title: "توزيع التقييمات", valueFormat: fmtInt }) +
          note(`متوسط ${m.feedbackSummary.averageRating.toFixed(2)} من ${m.feedbackSummary.count} تقييم.`),
    ),
    section(
      "تحذيرات المخزون",
      m.stockWarnings.length === 0
        ? emptyChart("لا توجد أصناف منخفضة أو ناقصة.")
        : dataTable(
            [
              { key: "name", label: "الصنف" },
              { key: "quantity", label: "المتوفر", numeric: true },
              { key: "min", label: "الحد الأدنى", numeric: true },
              { key: "unit", label: "الوحدة" },
              { key: "status", label: "الحالة" },
            ],
            m.stockWarnings.map((s) => ({
              name: s.name,
              quantity: s.quantity,
              min: s.min_threshold,
              unit: s.unit,
              status: s.status,
            })),
          ),
    ),
    insight
      ? section(
          "ملاحظات تحليلية",
          insight.pairs.length > 0 || insight.itemTrend.length > 0
            ? `<ul>${[
                ...insight.pairs.slice(0, 5).map(
                  (p) => `${escapeHtml(p.a)} + ${escapeHtml(p.b)} — ظهروا معًا ${p.count} مرة`,
                ),
                ...insight.itemTrend
                  .filter((i) => i.priorQty >= 5 && i.recentQty < i.priorQty * 0.6)
                  .slice(0, 5)
                  .map(
                    (i) =>
                      `${escapeHtml(i.name)} — الطلب نزل من ${i.priorQty} إلى ${i.recentQty}`,
                  ),
              ]
                .map((line) => `<li>${line}</li>`)
                .join("")}</ul>`
            : emptyChart("مفيش أنماط كافية في البيانات الحالية."),
        )
      : "",
  ].join("\n");

  return {
    kind: "sales_dashboard",
    title: `لوحة المبيعات — ${today()}`,
    summary: `${m.ordersInWindow} طلب، ${fmtEgp(m.revenueInWindow)} إيراد مكتمل، ${m.topItems.length} صنف مبيع.`,
    body: htmlDocument({
      title: `لوحة المبيعات والإحصاءات — ${today()}`,
      dir: "rtl",
      generatedAt: stamp(),
      sections,
    }),
    rowCount: m.revenueByDay.length,
    data: {
      ordersInWindow: m.ordersInWindow,
      revenueInWindow: m.revenueInWindow,
      avgOrderValue: m.avgOrderValue,
      statusBreakdown: m.statusBreakdown,
      revenueByDay: m.revenueByDay,
      topItems: m.topItems,
      categoryMix: m.categoryMix,
    },
  };
}

/* ------------------------------------------------------------------ 2. CRM summary */

/** CRM: who the customers are, how they are segmented, and who is drifting away. */
export async function crmSummary(): Promise<RenderedHtmlDeliverable> {
  const [stats, segments, insight, customers] = await Promise.all([
    getCrmStats(),
    segmentOverview(),
    collectInsightData(30).catch(() => null),
    listCrmCustomers({ limit: 200 }).catch(() => []),
  ]);

  const topCustomers = [...customers]
    .sort((a, b) => b.lifetime_value - a.lifetime_value)
    .slice(0, 10);

  const admin = createAdminSupabase();
  // Newest signups come from `profiles` (real columns only). Lifetime value and
  // order counts are NOT on that table — they are computed by the
  // `crm_customers` RPC, which is where the top-customers table below reads.
  const { data: recent } = await admin
    .from("profiles")
    .select("full_name, phone, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  const segmentSeries = segments
    .filter((s) => s.segment !== "all")
    .map((s) => ({ label: s.label, value: s.count }));

  const sections = [
    section(
      "ملخص العملاء",
      kpiGrid([
        { label: "إجمالي العملاء", value: fmtInt(stats.customer_count) },
        { label: "القيمة الشرائية الكلية", value: fmtEgp(stats.lifetime_value) },
        { label: "عملاء متكررون", value: fmtInt(stats.repeat_customers) },
        { label: "عملاء في خطر", value: fmtInt(stats.at_risk_customers) },
        { label: "مشتركون في التسويق", value: fmtInt(stats.marketing_opt_in) },
        { label: "عملاء محظورون", value: fmtInt(stats.blocked_customers) },
      ]),
    ),
    section(
      "الشرائح",
      segmentSeries.length === 0
        ? emptyChart("لا توجد شرائح بعد.")
        : gaugeRows(segmentSeries, { valueFormat: fmtInt }) +
          note("الشرائح محسوبة من الأوردرات الحقيقية — العميل ممكن يظهر في أكتر من شريحة."),
    ),
    section(
      "أحدث العملاء المسجلين",
      (recent ?? []).length === 0
        ? emptyChart("لا يوجد عملاء مسجلون بعد.")
        : dataTable(
            [
              { key: "name", label: "الاسم" },
              { key: "phone", label: "الهاتف" },
              { key: "created", label: "تاريخ التسجيل" },
            ],
            (recent ?? []).map((r) => ({
              name: r.full_name ?? "—",
              phone: r.phone ?? "—",
              created: r.created_at.slice(0, 10),
            })),
          ),
    ),
    section(
      "أعلى العملاء بالقيمة الشرائية",
      topCustomers.length === 0
        ? emptyChart("لا توجد بيانات شراء بعد.")
        : rankedBarChart(
            topCustomers.map((c) => ({
              label: c.full_name ?? c.phone ?? "—",
              value: c.lifetime_value,
            })),
            { valueFormat: fmtEgp, title: "أعلى العملاء" },
          ) +
          dataTable(
            [
              { key: "name", label: "العميل" },
              { key: "orders", label: "عدد الطلبات", numeric: true },
              { key: "value", label: "القيمة الشرائية", numeric: true },
              { key: "last", label: "آخر طلب" },
            ],
            topCustomers.map((c) => ({
              name: c.full_name ?? c.phone ?? "—",
              orders: c.order_count,
              value: fmtEgp(c.lifetime_value),
              last: c.last_order_at ? c.last_order_at.slice(0, 10) : "—",
            })),
          ),
    ),
    insight
      ? section(
          "عملاء غير نشطين",
          insight.inactiveCustomers.count === 0
            ? emptyChart("مفيش عملاء منقطعين دلوقتي.")
            : note(
                `${insight.inactiveCustomers.count} عميل مش طلب من فترة، بمتوسط ${
                  insight.inactiveCustomers.avgDaysSinceOrder != null
                    ? Math.round(insight.inactiveCustomers.avgDaysSinceOrder)
                    : "—"
                } يوم من آخر طلب.`,
                "warn",
              ),
        )
      : "",
  ].join("\n");

  return {
    kind: "crm_summary",
    title: `ملخص CRM — ${today()}`,
    summary: `${stats.customer_count} عميل، ${stats.repeat_customers} متكرر، ${stats.at_risk_customers} في خطر.`,
    body: htmlDocument({
      title: `ملخص علاقات العملاء (CRM) — ${today()}`,
      dir: "rtl",
      generatedAt: stamp(),
      sections,
    }),
    rowCount: stats.customer_count,
    data: { stats, segments },
  };
}

/* ------------------------------------------------------------------ 3. users report */

/** Users & access: who can sign in, and what they are allowed to do. */
export async function usersReport(): Promise<RenderedHtmlDeliverable> {
  const admin = createAdminSupabase();
  const [{ data: staffRows }, { data: profiles }, { count: authCount }] = await Promise.all([
    admin.from("staff").select("user_id, role, display_name, is_active, created_at"),
    admin.from("profiles").select("id, full_name, phone, email, locale, created_at").limit(2000),
    admin.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  const staff = staffRows ?? [];
  const activeStaff = staff.filter((s) => s.is_active);
  const roleCounts = new Map<string, number>();
  for (const s of staff) roleCounts.set(s.role, (roleCounts.get(s.role) ?? 0) + 1);

  const sections = [
    section(
      "نظرة عامة",
      kpiGrid([
        { label: "إجمالي المستخدمين", value: fmtInt(authCount ?? profiles?.length ?? 0) },
        { label: "أعضاء الفريق", value: fmtInt(staff.length) },
        { label: "أعضاء نشطون", value: fmtInt(activeStaff.length) },
        { label: "أعضاء موقوفون", value: fmtInt(staff.length - activeStaff.length) },
      ]),
    ),
    section(
      "توزيع الأدوار",
      roleCounts.size === 0
        ? emptyChart("لا يوجد أعضاء فريق بعد.")
        : donutChart(
            [...roleCounts.entries()].map(([role, count]) => ({ label: role, value: count })),
            { title: "الأدوار", valueFormat: fmtInt },
          ),
    ),
    section(
      "أعضاء الفريق",
      staff.length === 0
        ? emptyChart("لا يوجد أعضاء فريق مسجلين.")
        : dataTable(
            [
              { key: "name", label: "الاسم" },
              { key: "role", label: "الدور" },
              { key: "active", label: "الحالة" },
              { key: "created", label: "تاريخ الإضافة" },
            ],
            staff.map((s) => ({
              name: s.display_name ?? "—",
              role: s.role,
              active: s.is_active ? "نشط" : "موقوف",
              created: s.created_at.slice(0, 10),
            })),
          ),
    ),
    section(
      "العملاء المسجلون",
      (profiles ?? []).length === 0
        ? emptyChart("لا يوجد مستخدمون مسجلون.")
        : dataTable(
            [
              { key: "name", label: "الاسم" },
              { key: "phone", label: "الهاتف" },
              { key: "email", label: "البريد" },
              { key: "locale", label: "اللغة" },
              { key: "created", label: "تاريخ التسجيل" },
            ],
            (profiles ?? []).slice(0, 100).map((p) => ({
              name: p.full_name ?? "—",
              phone: p.phone ?? "—",
              email: p.email ?? "—",
              locale: p.locale ?? "—",
              created: p.created_at.slice(0, 10),
            })),
          ) +
          ((profiles?.length ?? 0) > 100
            ? note(`معروض أول 100 من ${profiles?.length} مستخدم.`)
            : ""),
    ),
  ].join("\n");

  return {
    kind: "users_report",
    title: `تقرير المستخدمين والصلاحيات — ${today()}`,
    summary: `${authCount ?? 0} مستخدم، ${staff.length} عضو فريق (${activeStaff.length} نشط).`,
    body: htmlDocument({
      title: `تقرير المستخدمين والصلاحيات — ${today()}`,
      dir: "rtl",
      generatedAt: stamp(),
      sections,
    }),
    rowCount: staff.length,
    data: { staff, roleCounts: Object.fromEntries(roleCounts) },
  };
}

/* ------------------------------------------------------------------ 4. inventory report */

/** Full stock position — on hand, thresholds, value and what to reorder. */
export async function inventoryReport(): Promise<RenderedHtmlDeliverable> {
  const admin = createAdminSupabase();
  const { data: stockRaw } = await admin
    .from("stock_items")
    .select("name_en, unit, quantity, min_threshold, cost_per_unit, supplier, status")
    .order("name_en", { ascending: true })
    .limit(1000);

  const stock = stockRaw ?? [];
  const needs = stock.filter((s) => s.status === "low" || s.status === "out");
  const totalValue = stock.reduce(
    (sum, s) => sum + Number(s.quantity) * (s.cost_per_unit != null ? Number(s.cost_per_unit) : 0),
    0,
  );
  const reorderValue = needs.reduce((sum, s) => {
    const qty = Number(s.quantity);
    const threshold = Number(s.min_threshold);
    const target = threshold > 0 ? threshold * 2 : Math.max(qty, 1);
    const toOrder = Math.max(Math.ceil(target - qty), 1);
    return sum + toOrder * (s.cost_per_unit != null ? Number(s.cost_per_unit) : 0);
  }, 0);

  const statusCounts = new Map<string, number>();
  for (const s of stock) statusCounts.set(s.status, (statusCounts.get(s.status) ?? 0) + 1);

  const sections = [
    section(
      "نظرة عامة",
      kpiGrid([
        { label: "أصناف المخزون", value: fmtInt(stock.length) },
        { label: "تحتاج إعادة طلب", value: fmtInt(needs.length) },
        { label: "قيمة المخزون", value: fmtEgp(totalValue) },
        { label: "تكلفة إعادة الطلب", value: fmtEgp(reorderValue) },
      ]),
    ),
    section(
      "حالة المخزون",
      statusCounts.size === 0
        ? emptyChart("مفيش أصناف مخزون مسجلة.")
        : donutChart(
            [...statusCounts.entries()].map(([status, count]) => ({ label: status, value: count })),
            { title: "الحالات", valueFormat: fmtInt },
          ),
    ),
    section(
      "المطلوب إعادة طلبه",
      needs.length === 0
        ? emptyChart("مفيش حاجة ناقصة أو منخفضة.")
        : dataTable(
            [
              { key: "name", label: "الصنف" },
              { key: "unit", label: "الوحدة" },
              { key: "onHand", label: "المتوفر", numeric: true },
              { key: "min", label: "الحد الأدنى", numeric: true },
              { key: "toOrder", label: "المطلوب", numeric: true },
              { key: "supplier", label: "المورد" },
              { key: "status", label: "الحالة" },
            ],
            needs.map((s) => {
              const qty = Number(s.quantity);
              const threshold = Number(s.min_threshold);
              const target = threshold > 0 ? threshold * 2 : Math.max(qty, 1);
              return {
                name: s.name_en,
                unit: s.unit,
                onHand: qty,
                min: threshold,
                toOrder: Math.max(Math.ceil(target - qty), 1),
                supplier: s.supplier ?? "—",
                status: s.status,
              };
            }),
          ) +
          note("الكمية المطلوبة تحسب الوصول لضعف الحد الأدنى، عشان التوصيلة تغطي دورة كاملة."),
    ),
    section(
      "كل الأصناف",
      stock.length === 0
        ? emptyChart("مفيش أصناف مخزون مسجلة.")
        : dataTable(
            [
              { key: "name", label: "الصنف" },
              { key: "unit", label: "الوحدة" },
              { key: "qty", label: "المتوفر", numeric: true },
              { key: "min", label: "الحد الأدنى", numeric: true },
              { key: "cost", label: "تكلفة الوحدة", numeric: true },
              { key: "value", label: "القيمة", numeric: true },
              { key: "status", label: "الحالة" },
            ],
            stock.map((s) => ({
              name: s.name_en,
              unit: s.unit,
              qty: Number(s.quantity),
              min: Number(s.min_threshold),
              cost: s.cost_per_unit != null ? fmtEgp(Number(s.cost_per_unit)) : "—",
              value:
                s.cost_per_unit != null
                  ? fmtEgp(Number(s.quantity) * Number(s.cost_per_unit))
                  : "—",
              status: s.status,
            })),
          ),
    ),
  ].join("\n");

  return {
    kind: "inventory_report",
    title: `تقرير الجرد — ${today()}`,
    summary: `${stock.length} صنف، ${needs.length} يحتاج إعادة طلب، قيمة ${fmtEgp(totalValue)}.`,
    body: htmlDocument({
      title: `تقرير الجرد والمخزون — ${today()}`,
      dir: "rtl",
      generatedAt: stamp(),
      sections,
    }),
    rowCount: stock.length,
    data: { stock, needs, totalValue, reorderValue },
  };
}

/* ------------------------------------------------------------------ 5. slide deck */

/**
 * A presentable deck. Each slide is one idea and one chart at most, and the
 * closing slide is the recommendations — grounded in the same snapshot the
 * charts were drawn from, so a claim and its number cannot diverge.
 */
export async function slideDeck(): Promise<RenderedHtmlDeliverable> {
  const m = await getDashboardMetrics(30);
  const insight = await collectInsightData(30).catch(() => null);

  const revenueSeries = m.revenueByDay.map((d) => ({ label: d.day.slice(5), value: d.revenue }));
  const topSeries = m.topItems.slice(0, 6).map((t) => ({ label: t.name, value: t.revenue }));
  const categorySeries = m.categoryMix.slice(0, 6).map((c) => ({ label: c.category, value: c.revenue }));

  const recommendations: string[] = [];
  if (m.ordersInWindow < 30) {
    recommendations.push(
      `عدد الطلبات في الفترة ${m.ordersInWindow} بس — الأرقام دي اتجاهية، ومحتاجة 30–50 طلب عشان تبقى موثوقة.`,
    );
  }
  if (insight?.pairs[0]) {
    recommendations.push(
      `أشهر توليفة: ${insight.pairs[0].a} مع ${insight.pairs[0].b} (${insight.pairs[0].count} مرة) — جرّب تعرضها كإضافة بضغطة واحدة.`,
    );
  }
  const declining = insight?.itemTrend
    .filter((i) => i.priorQty >= 5 && i.recentQty < i.priorQty * 0.6)
    .slice(0, 3) ?? [];
  for (const d of declining) {
    recommendations.push(`${d.name}: الطلب نزل من ${d.priorQty} إلى ${d.recentQty} — راجع التوفّر والترتيب على المنيو.`);
  }
  if (m.stockWarnings.length > 0) {
    recommendations.push(`${m.stockWarnings.length} صنف مخزون منخفض أو ناقص — راجع الجرد قبل الويك إند.`);
  }
  if (m.feedbackSummary.count > 0) {
    recommendations.push(
      `متوسط التقييم ${m.feedbackSummary.averageRating.toFixed(2)} من ${m.feedbackSummary.count} تقييم${
        m.feedbackSummary.openCount > 0 ? ` (فيه ${m.feedbackSummary.openCount} محتاج رد)` : ""
      }.`,
    );
  }
  if (recommendations.length === 0) recommendations.push("مفيش حاجة محتاجة تدخّل دلوقتي — استمر على الخطة.");

  const slides = [
    slide(
      "أداء المطعم — نظرة عامة",
      kpiGrid([
        { label: "طلبات الفترة", value: fmtInt(m.ordersInWindow) },
        { label: "الإيرادات", value: fmtEgp(m.revenueInWindow) },
        { label: "متوسط الطلب", value: fmtEgp(m.avgOrderValue) },
        { label: "عملاء جدد", value: fmtInt(m.newCustomers) },
      ]) + note(`الفترة: آخر ${m.windowDays} يوم. الإيراد من الطلبات المكتملة فقط.`),
    ),
    slide(
      "الإيرادات يوم بيوم",
      m.revenueByDay.length === 0
        ? emptyChart("لا توجد إيرادات في الفترة.")
        : barChart(revenueSeries, { valueFormat: fmtEgp, title: "الإيرادات اليومية" }),
    ),
    slide(
      "حالات الطلبات",
      m.statusBreakdown.length === 0
        ? emptyChart("لا توجد طلبات.")
        : donutChart(
            m.statusBreakdown.map((s) => ({ label: s.status, value: s.count })),
            { title: "الحالات", valueFormat: fmtInt },
          ),
    ),
    slide(
      "أعلى الأصناف",
      topSeries.length === 0
        ? emptyChart("لا توجد أصناف مبيعة.")
        : rankedBarChart(topSeries, { valueFormat: fmtEgp, title: "أعلى الأصناف" }),
    ),
    slide(
      "توزيع الفئات",
      categorySeries.length === 0
        ? emptyChart("لا توجد فئات مبيعة.")
        : donutChart(categorySeries, { title: "الفئات", valueFormat: fmtEgp }),
    ),
    slide(
      "التوصيات",
      `<ol>${recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ol>`,
    ),
  ].join("\n");

  return {
    kind: "slide_deck",
    title: `عرض تقديمي — أداء المطعم ${today()}`,
    summary: `${slides.split('class="slide"').length - 1} شرائح من ${m.ordersInWindow} طلب و${m.topItems.length} صنف.`,
    body: htmlDocument({
      title: `عرض تقديمي — أداء المطعم`,
      dir: "rtl",
      generatedAt: stamp(),
      sections: slides,
      footer: "اقلب كل شريحة على صفحة عند الطباعة أو التصدير لـ PDF.",
    }),
    rowCount: m.revenueByDay.length,
    data: { recommendations, revenueByDay: m.revenueByDay, topItems: m.topItems },
  };
}

/* ------------------------------------------------------------------ 6. strategy brief */

/**
 * A written plan: the analysis, then numbered actions with owners and measures.
 *
 * The analysis section is deliberately explicit about sample size, because the
 * live database is small and a plan built on four orders should say so.
 */
export async function strategyBrief(): Promise<RenderedHtmlDeliverable> {
  const [m, insight] = await Promise.all([
    getDashboardMetrics(30),
    collectInsightData(30).catch(() => null),
  ]);

  const plans: { title: string; why: string; steps: string[]; measure: string }[] = [];

  if (m.ordersInWindow < 30) {
    plans.push({
      title: "زوّد عدد الطلبات قبل أي قرار سعري",
      why: `الفترة فيها ${m.ordersInWindow} طلب بس. أي نسبة محسوبة من العدد ده بتتقلب بسهولة.`,
      steps: [
        "شغّل عرض ترحيبي لأول طلب لمدة أسبوعين.",
        "أضف لينك الطلب المباشر على إنستجرام وتيك توك.",
        "تابع الطلبات اليومية كل يوم قبل ما تغيّر أي حاجة في المنيو.",
      ],
      measure: "الوصول لـ 30 طلب في 30 يوم على الأقل.",
    });
  }

  if (insight?.pairs[0]) {
    const p = insight.pairs[0];
    plans.push({
      title: `استغل توليفة ${p.a} + ${p.b}`,
      why: `الطلبية الواحدة جمعت الصنفين ${p.count} مرة في آخر ${m.windowDays} يوم — الطلب موجود بالفعل.`,
      steps: [
        `اعرض ${p.b} كإضافة بضغطة واحدة لما ${p.a} يبقى في السلة.`,
        "سعّر الإضافة بسعر جاذب لمدة أسبوعين.",
        "قارن نسبة الإضافة قبل وبعد.",
      ],
      measure: "نسبة إضافة الصنف على الطلبات اللي فيها الصنف الأساسي.",
    });
  }

  const weak = insight?.weakItems.slice(0, 3) ?? [];
  for (const w of weak) {
    plans.push({
      title: `راجع الصنف: ${w.name}`,
      why: `باع ${w.quantity} وحدة وحقّق ${fmtEgp(w.revenue)} في ${m.windowDays} يوم — من أقل الأصناف مساهمة.`,
      steps: [
        "اتأكد إنه مش بيخلص بسرعة وإنه ظاهر في مكان واضح على المنيو.",
        "جرّب وصف أو صورة أوضح للأسبوع الجاي.",
        "لو مفيش تحسّن بعد أسبوعين، فكّر تعيد تسعيره أو تشيله.",
      ],
      measure: "الكمية المبيعة في الأسبوعين اللي بعدهما.",
    });
  }

  const sections = [
    section(
      "الوضع الحالي",
      kpiGrid([
        { label: "طلبات الفترة", value: fmtInt(m.ordersInWindow) },
        { label: "الإيرادات المكتملة", value: fmtEgp(m.revenueInWindow) },
        { label: "متوسط الطلب", value: fmtEgp(m.avgOrderValue) },
        { label: "عملاء جدد", value: fmtInt(m.newCustomers) },
      ]) +
        (m.ordersInWindow < 30
          ? note(
              "حجم العينة صغير. الخطة دي اتجاهية، ومبنية على البيانات الحقيقية الموجودة بس.",
              "warn",
            )
          : ""),
    ),
    section(
      "الخطط المقترحة",
      plans.length === 0
        ? emptyChart("مفيش بيانات كافية لاقتراح خطة دلوقتي.")
        : plans
            .map(
              (p, i) => `<h3>خطة ${i + 1}: ${escapeHtml(p.title)}</h3>
        <p><strong>ليه:</strong> ${escapeHtml(p.why)}</p>
        <ol>${p.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
        <p><strong>إزاي نقيس:</strong> ${escapeHtml(p.measure)}</p>`,
            )
            .join("\n"),
    ),
    section(
      "مؤشرات المتابعة",
      dataTable(
        [
          { key: "metric", label: "المؤشر" },
          { key: "now", label: "القيمة الحالية", numeric: true },
          { key: "target", label: "المستهدف", numeric: true },
        ],
        [
          { metric: "طلبات / 30 يوم", now: m.ordersInWindow, target: 30 },
          { metric: "متوسط قيمة الطلب (EGP)", now: m.avgOrderValue.toFixed(2), target: "—" },
          { metric: "عملاء جدد / 30 يوم", now: m.newCustomers, target: 10 },
          {
            metric: "متوسط التقييم",
            now: m.feedbackSummary.count > 0 ? m.feedbackSummary.averageRating.toFixed(2) : "—",
            target: 4.5,
          },
        ],
      ) + note("المستهدفات مقترحة للمراجعة، مش أرقام من الداتابيز."),
    ),
  ].join("\n");

  return {
    kind: "strategy_brief",
    title: `خطة عمل — ${today()}`,
    summary: `${plans.length} خطة مبنية على ${m.ordersInWindow} طلب و${m.topItems.length} صنف.`,
    body: htmlDocument({
      title: `خطة عمل مبنية على البيانات — ${today()}`,
      dir: "rtl",
      generatedAt: stamp(),
      sections,
    }),
    rowCount: plans.length,
    data: { plans },
  };
}

export const HTML_DELIVERABLE_TITLES: Record<HtmlDeliverableKind, string> = {
  sales_dashboard: "لوحة المبيعات والإحصاءات (رسومات بيانية)",
  crm_summary: "ملخص CRM",
  users_report: "تقرير المستخدمين والصلاحيات",
  inventory_report: "تقرير الجرد والمخزون",
  slide_deck: "عرض تقديمي (slide deck)",
  strategy_brief: "خطة عمل / strategy brief",
};

export function isHtmlDeliverableKind(value: string): value is HtmlDeliverableKind {
  return value in HTML_DELIVERABLE_TITLES;
}

export function renderHtmlDeliverableCatalogue(): string {
  return (Object.keys(HTML_DELIVERABLE_TITLES) as HtmlDeliverableKind[])
    .map((k) => `- ${k}: ${HTML_DELIVERABLE_TITLES[k]}`)
    .join("\n");
}

export async function renderHtmlDeliverable(
  kind: HtmlDeliverableKind,
): Promise<RenderedHtmlDeliverable> {
  switch (kind) {
    case "sales_dashboard":
      return salesDashboard();
    case "crm_summary":
      return crmSummary();
    case "users_report":
      return usersReport();
    case "inventory_report":
      return inventoryReport();
    case "slide_deck":
      return slideDeck();
    case "strategy_brief":
      return strategyBrief();
    default:
      throw new Error(`No HTML renderer for "${kind}".`);
  }
}
