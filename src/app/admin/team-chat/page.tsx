import { redirect } from "next/navigation";

/**
 * Team chat is a tab of the chat hub now. This route is kept only so an
 * existing bookmark or notification link does not 404.
 */
export default function AdminTeamChatPage() {
  redirect("/admin/chat?tab=team");
}
