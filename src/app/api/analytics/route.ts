import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";
import type { ActivityEvent } from "@/lib/activity/log";

const EVENTS = [
  "PAGE_VIEW",
  "MENU_VIEW",
  "ITEM_VIEW",
  "CART_ADD",
  "CART_REMOVE",
  "CHECKOUT_STARTED",
  "ASSISTANT_USED",
] as const;
type FunnelEvent = (typeof EVENTS)[number];

/**
 * Hand-rolled validation, not zod.
 *
 * This endpoint is hit by `sendBeacon` on every public page view — it is the
 * single hottest dynamic route on the site — and a zod schema dragged the whole
 * validator into its bundle. On the Free plan a cold parse of that is a real
 * slice of the 10 ms CPU budget, spent re-validating seven known strings. The
 * shape is fixed and tiny, so it is checked directly.
 */
function parseBody(input: unknown): {
  event: FunnelEvent;
  path: string | null;
  session_id: string;
  device: string | null;
  referrer: string | null;
  metadata: Record<string, unknown>;
} | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.event !== "string" || !EVENTS.includes(raw.event as FunnelEvent)) return null;
  if (typeof raw.session_id !== "string" || raw.session_id.length > 100) return null;
  const text = (value: unknown, max: number): string | null =>
    typeof value === "string" ? value.slice(0, max) : null;
  return {
    event: raw.event as FunnelEvent,
    path: text(raw.path, 300),
    session_id: raw.session_id,
    device: text(raw.device, 20),
    referrer: text(raw.referrer, 500),
    metadata:
      typeof raw.metadata === "object" && raw.metadata !== null
        ? (raw.metadata as Record<string, unknown>)
        : {},
  };
}

/** Maps a funnel event onto the matching activity-log event, when one exists. */
const ACTIVITY_MAP: Partial<Record<FunnelEvent, ActivityEvent>> = {
  MENU_VIEW: "MENU_VIEW",
  ITEM_VIEW: "ITEM_VIEW",
  CART_ADD: "CART_ADD",
  CART_REMOVE: "CART_REMOVE",
  CHECKOUT_STARTED: "CHECKOUT_STARTED",
  ASSISTANT_USED: "ASSISTANT_USED",
};

/**
 * Ingests a funnel event. The anonymous analytics row is written with the
 * service role (anonymous inserts are not permitted by policy), and an
 * activity-log row is added when the caller is signed in, so the CRM timeline
 * reflects real behaviour.
 */
export async function POST(request: NextRequest) {
  let parsed: ReturnType<typeof parseBody>;
  try {
    parsed = parseBody(await request.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!parsed) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    // Analytics is optional: without a service key the site simply does not
    // collect it rather than failing the customer's navigation.
    return NextResponse.json({ ok: true, stored: false });
  }

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const userId = (data?.claims?.sub as string | undefined) ?? null;

  const { error } = await admin.from("analytics_events").insert({
    user_id: userId,
    session_id: parsed.session_id,
    event: parsed.event,
    path: parsed.path,
    device: parsed.device,
    referrer: parsed.referrer,
    metadata: parsed.metadata as never,
  });

  if (error) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const activityEvent = ACTIVITY_MAP[parsed.event];
  if (activityEvent && userId) {
    await admin.from("activity_logs").insert({
      user_id: userId,
      event: activityEvent,
      entity: parsed.metadata.slug ? "menu_items" : null,
      entity_id:
        typeof parsed.metadata.menu_item_id === "string"
          ? parsed.metadata.menu_item_id
          : null,
      session_id: parsed.session_id,
      metadata: parsed.metadata as never,
    });
  }

  return NextResponse.json({ ok: true, stored: true });
}
