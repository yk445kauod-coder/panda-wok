import { adminJsonUnlocked } from "@/lib/admin/api";
import { capabilitiesFor, type StaffRole } from "@/lib/auth/rbac";

/** The locked-out member's own role and capabilities, for /admin/denied. */
export async function GET() {
  return adminJsonUnlocked(async (role: StaffRole) => ({
    role,
    capabilities: capabilitiesFor(role),
  }));
}
