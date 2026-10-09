import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { createServerSupabase } from "@/lib/supabase/server";
import { fileResponse } from "@/lib/files/download";

export const dynamic = "force-dynamic";

/**
 * Streams one stored export straight from the database.
 *
 * Files are local-first — the bytes are in `exports.content`, not in object
 * storage — so this route is the only download path. It authorises through the
 * ops gate (`exports.manage`) rather than RLS, because the console is unlocked
 * by a passcode and has no `auth.uid()`. `createServerSupabase` elevates to the
 * service role on `/admin`, which is how the row is read.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session || !can(session.role, "exports.manage")) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("exports")
    .select("dataset, format, content, content_encoding, created_at")
    .eq("id", id)
    .maybeSingle();

  const response = fileResponse(data);
  if (!response) {
    return NextResponse.json({ error: "That file is not available." }, { status: 404 });
  }
  return response;
}
