import { redirect } from "next/navigation";

/**
 * The messages view was a second rewrite of the customer inbox. It is a tab of
 * the chat hub now; this route only survives to keep existing links working.
 */
export default function AdminMessagesPage() {
  redirect("/admin/chat?tab=customers");
}
