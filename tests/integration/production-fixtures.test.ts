import "dotenv/config";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDatabaseClient } from "../../src/server/database/client";
import { verifyTarget } from "../../scripts/database-target";
import { readDatabaseUrl } from "../../src/server/database/environment";
import { initializeProductionFixtures } from "../../scripts/production-fixtures";

let db: ReturnType<typeof createDatabaseClient>;
beforeAll(async () => {
  const url = readDatabaseUrl(process.env, "TEST_DATABASE_URL");
  await verifyTarget(url, "test");
  db = createDatabaseClient(url);
});
afterAll(async () => { await db?.$disconnect(); });
it("initializes coherent synthetic staffing once, refuses reruns, and rolls back failures", async () => {
  const before = await db.volunteerProfile.count();
  const rollback = new Error("isolated fixture rehearsal rollback");
  await expect(db.$transaction(async tx => {
    // Only the verified local TEST database. Deletes and new fixtures are rolled back.
    await tx.shiftAssignment.deleteMany(); await tx.shift.deleteMany(); await tx.shiftPattern.deleteMany();
    await tx.shiftDefinition.deleteMany(); await tx.availability.deleteMany(); await tx.volunteerRoleMembership.deleteMany();
    await tx.volunteerProfile.deleteMany(); await tx.volunteerRole.deleteMany();
    const accounts = await tx.account.count(), sessions = await tx.session.count();
    expect(await initializeProductionFixtures(tx, "2026-11-16")).toEqual({ volunteers: 8, roles: 2, shiftTypes: 2, patterns: 1, shifts: 4, assignments: 4 });
    const shifts = await tx.shift.findMany({ include: { assignments: true }, orderBy: { startsAt: "asc" } });
    expect(shifts.map(shift => shift.capacity - shift.assignments.length)).toEqual([0, 1, 2, 1]);
    expect(shifts.filter(shift => shift.patternId).every(shift => shift.occurrenceDate)).toBe(true);
    expect(await tx.availability.count()).toBe(56);
    expect(await tx.account.count()).toBe(accounts); expect(await tx.session.count()).toBe(sessions);
    await expect(initializeProductionFixtures(tx, "2026-11-16")).rejects.toThrow("must be empty");
    expect(await tx.volunteerProfile.count()).toBe(8);
    throw rollback;
  }, { timeout: 30000 })).rejects.toBe(rollback);
  expect(await db.volunteerProfile.count()).toBe(before);
});
