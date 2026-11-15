import "server-only";
import { getDatabase } from "../db";
import { requirePermission } from "../auth/permissions";

export type DashboardShift = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  name: string;
  role: string;
  assigned: number;
  remaining: number;
};

// The optional instant makes the rolling window deterministic in integration tests.
// Reads report recorded occurrences only; they never extend repeating schedules.
export async function getDashboard(now = new Date()) {
  const user = await requirePermission("volunteers:read");
  await requirePermission("scheduling:read");
  const windowStart = new Date(now);
  const windowEnd = new Date(windowStart.getTime() + 168 * 60 * 60 * 1000);

  return getDatabase().$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const activeVolunteers = await tx.volunteerProfile.count({ where: { status: "ACTIVE" } });
    let upcomingShifts = 0, shiftsNeedingCoverage = 0, openVolunteerSpots = 0;
    const upcoming: DashboardShift[] = [], coverage: DashboardShift[] = [];
    let after: { startsAt: Date; id: string } | undefined;

    // Usually one batch at this organization's scale. Keep memory bounded without
    // truncating totals when a week contains more than one batch of occurrences.
    while (true) {
      const shifts = await tx.shift.findMany({
        where: {
          status: "SCHEDULED", startsAt: { gt: windowStart, lt: windowEnd },
          ...(after ? { OR: [{ startsAt: { gt: after.startsAt } }, { startsAt: after.startsAt, id: { gt: after.id } }] } : {}),
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 200,
        select: {
          id: true, startsAt: true, endsAt: true, capacity: true,
          definition: { select: { name: true, role: { select: { name: true } } } },
          _count: { select: { assignments: { where: { status: "ASSIGNED" } } } },
        },
      });
      for (const shift of shifts) {
        const assigned = shift._count.assignments;
        const remaining = Math.max(0, shift.capacity - assigned);
        const row: DashboardShift = {
          id: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt, capacity: shift.capacity,
          name: shift.definition.name, role: shift.definition.role.name, assigned, remaining,
        };
        upcomingShifts++;
        if (upcoming.length < 5) upcoming.push(row);
        if (remaining > 0) {
          shiftsNeedingCoverage++;
          openVolunteerSpots += remaining;
          if (coverage.length < 5) coverage.push(row);
        }
      }
      if (shifts.length < 200) break;
      const last = shifts[shifts.length - 1];
      after = { startsAt: last.startsAt, id: last.id };
    }
    return {
      windowStart, windowEnd, activeVolunteers, upcomingShifts, shiftsNeedingCoverage,
      openVolunteerSpots, upcoming, coverage,
      canWrite: user.role === "ADMIN" || user.role === "COORDINATOR",
    };
  }, { isolationLevel: "RepeatableRead" });
}
