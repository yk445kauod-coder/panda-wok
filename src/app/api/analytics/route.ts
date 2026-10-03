import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";
import type { ActivityEvent } from "@/lib/activity/log";

const bodySchema = z.object({
  event: z.enum([
    "PAGE_VIEW",
    "MENU_VIEW",
    "ITEM_VIEW",
    "CART_ADD",
    "CART_REMOVE",
    "CHECKOUT_STARTED",
    "ASSISTANT_USED",
  ]),
  path: z.string().max(300).nullable().optional(),
  session_id: z.string().max(100),
  device: z.string().max(20).nullable().optional(),
  referrer: z.string().max(500).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/** Maps a funnel event onto the matching activity-log event, when one exists. */
const ACTIVITY_MAP: Partial<
  Record<z.infer<typeof bodySchema>["event"], ActivityEvent>
> = {
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
  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!parsed.success) {
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
    session_id: parsed.data.session_id,
    event: parsed.data.event,
    path: parsed.data.path ?? null,
    device: parsed.data.device ?? null,
    referrer: parsed.data.referrer ?? null,
    metadata: parsed.data.metadata as never,
  });

  if (error) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const activityEvent = ACTIVITY_MAP[parsed.data.event];
  if (activityEvent && userId) {
    await admin.from("activity_logs").insert({
      user_id: userId,
      event: activityEvent,
      entity: parsed.data.metadata.slug ? "menu_items" : null,
      entity_id:
        typeof parsed.data.metadata.menu_item_id === "string"
          ? parsed.data.metadata.menu_item_id
          : null,
      session_id: parsed.data.session_id,
      metadata: parsed.data.metadata as never,
    });
  }

  return NextResponse.json({ ok: true, stored: true });
}
