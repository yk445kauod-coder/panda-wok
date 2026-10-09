import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { createServerSupabase } from "@/lib/supabase/server";
import { fileResponse } from "@/lib/files/download";

export const dynamic = "force-dynamic";

/**
 * Streams one stored backup straight from the database. Local-first, same as
 * exports: the bytes live in `backup_records.content`, so no object storage is
 * touched. Authorised through the ops gate (`backups.view`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session || !can(session.role, "backups.view")) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("backup_records")
    .select("kind, format, content, content_encoding, created_at")
    .eq("id", id)
    .maybeSingle();

  const response = fileResponse(data);
  if (!response) {
    return NextResponse.json({ error: "That file is not available." }, { status: 404 });
  }
  return response;
}
