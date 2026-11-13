import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

export async function getMyFeedback(
  userId: string,
): Promise<Database["public"]["Tables"]["feedback"]["Row"][]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load your feedback: ${error.message}`);
  return data ?? [];
}
