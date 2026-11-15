import "server-only";
import { getDatabase } from "../db";
import { requirePermission } from "../auth/permissions";

// Each operation checks current permissions, even when called outside a page.
export { getDashboard } from "./dashboard";

export async function getVolunteers() {
  await requirePermission("volunteers:read");
  return getDatabase().volunteerProfile.findMany({
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    select: { id: true, displayName: true, status: true,
      roles: { orderBy: { role: { name: "asc" } }, select: { role: { select: { name: true, isActive: true } } } } },
  });
}

export async function getShifts() {
  await requirePermission("scheduling:read");
  return getDatabase().shift.findMany({
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: { id: true, startsAt: true, endsAt: true, capacity: true, status: true,
      definition: { select: { name: true, role: { select: { name: true } } } },
      assignments: { where: { status: "ASSIGNED" }, orderBy: { volunteer: { displayName: "asc" } },
        select: { id: true, status: true, volunteer: { select: { displayName: true } } } } },
  });
}
