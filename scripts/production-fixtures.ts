import type { Prisma } from "../src/generated/prisma/client";
import { addDays, dateValue, dayNumber, localInstant } from "../src/server/scheduling/dates";

export function fixtureDates(start: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(dateValue(start).getTime()) || dateValue(start).toISOString().slice(0, 10) !== start) {
    throw new Error("Use a valid explicit fixture start date.");
  }
  return [0, 1, 3, 7].map(offset => addDays(start, offset));
}

// Called only in an operator-owned transaction (or isolated integration test).
// No upserts: any existing operational record makes initialization fail closed.
export async function initializeProductionFixtures(tx: Prisma.TransactionClient, start: string) {
  const dates = fixtureDates(start);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7684202608::bigint)`;
  // Exclude concurrent application inserts/updates during the emptiness check.
  await tx.$executeRawUnsafe('LOCK TABLE "VolunteerRole", "VolunteerProfile", "VolunteerRoleMembership", "Availability", "ShiftDefinition", "ShiftPattern", "Shift", "ShiftAssignment" IN EXCLUSIVE MODE');
  const counts = await Promise.all([
    tx.volunteerRole.count(), tx.volunteerProfile.count(), tx.volunteerRoleMembership.count(), tx.availability.count(),
    tx.shiftDefinition.count(), tx.shiftPattern.count(), tx.shift.count(), tx.shiftAssignment.count(),
  ]);
  if (counts.some(Boolean)) throw new Error("Operational tables must be empty; initialization was not performed.");
  const cafe = await tx.volunteerRole.create({ data: { name: "Synthetic Demo Cafe" } });
  const setup = await tx.volunteerRole.create({ data: { name: "Synthetic Demo Setup" } });
  const volunteers = [];
  for (let i = 0; i < 8; i++) {
    const roleId = i < 4 ? cafe.id : setup.id;
    volunteers.push(await tx.volunteerProfile.create({ data: {
      displayName: `Synthetic Demo Volunteer ${i + 1}`, email: `synthetic-${i + 1}@example.invalid`,
      status: i === 7 ? "INACTIVE" : "ACTIVE", roles: { create: { roleId } },
      availability: { create: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: 480, endMinute: 1080, validFrom: dateValue(start), validUntil: dateValue(addDays(start, 28)) })) },
    } }));
  }
  const cafeType = await tx.shiftDefinition.create({ data: { name: "Synthetic Demo Cafe Morning", roleId: cafe.id } });
  const setupType = await tx.shiftDefinition.create({ data: { name: "Synthetic Demo Setup Afternoon", roleId: setup.id } });
  const pattern = await tx.shiftPattern.create({ data: {
    definitionId: cafeType.id, dayOfWeek: dayNumber(start), startMinute: 540, durationMinutes: 120,
    capacity: 2, validFrom: dateValue(start), validUntil: dateValue(addDays(start, 7)),
  } });
  for (const [i, day] of Array.from(dates.entries())) {
    const recurring = i === 0 || i === 3;
    const minute = recurring ? 540 : 840;
    const assigned = i === 0 ? [volunteers[0], volunteers[1]] : i === 2 ? [] : [volunteers[recurring ? 2 : 4]];
    await tx.shift.create({ data: {
      definitionId: recurring ? cafeType.id : setupType.id, patternId: recurring ? pattern.id : null,
      occurrenceDate: recurring ? dateValue(day) : null, startsAt: localInstant(day, minute), endsAt: localInstant(day, minute + 120),
      capacity: 2, assignments: { create: assigned.map(volunteer => ({ volunteerId: volunteer.id })) },
    } });
  }
  return { volunteers: 8, roles: 2, shiftTypes: 2, patterns: 1, shifts: 4, assignments: 4 };
}
