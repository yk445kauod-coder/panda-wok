import { adminJsonUnlocked } from "@/lib/admin/api";
import { capabilitiesFor, type StaffRole } from "@/lib/auth/rbac";

/** The role's own capabilities, for the guide's capability matrix. */
export async function GET() {
  return adminJsonUnlocked(async (role: StaffRole) => ({
    role,
    capabilities: capabilitiesFor(role),
  }));
}
