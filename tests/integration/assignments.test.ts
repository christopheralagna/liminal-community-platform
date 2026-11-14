import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { betterAuth } from "better-auth";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDatabaseClient } from "../../src/server/database/client";
import { readDatabaseUrl } from "../../src/server/database/environment";
import { verifyTarget } from "../../scripts/database-target";
import { createAuth } from "../../src/server/auth/factory";
import { getAssignmentCandidates, mutateAssignment } from "../../src/server/scheduling/assignments";
import { getShift, mutateScheduling } from "../../src/server/scheduling/service";
import { saveVolunteer, getVolunteerEditor } from "../../src/server/volunteers/service";
import { assignmentAction } from "../../src/app/admin/(protected)/scheduling/assignment-actions";
import ShiftPage from "../../src/app/admin/(protected)/scheduling/[id]/page";
import { addDays, dateValue, dayNumber, localInstant, phoenixDate } from "../../src/server/scheduling/dates";
import { revalidatePath } from "next/cache";
import type { Prisma } from "../../src/generated/prisma/client";

const request = new AsyncLocalStorage<Headers>();
let pageHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => request.getStore() ?? pageHeaders }));
vi.mock("../../src/server/db", () => ({ getDatabase: () => db }));
vi.mock("../../src/server/auth/index", () => ({ getAuth: () => auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {}, notFound: () => { throw new Error("NOT_FOUND"); } }));
let db: ReturnType<typeof createDatabaseClient>;
let auth: ReturnType<typeof createAuth>;
const prefix = `assignments-test-${randomUUID()}`;
const sessions: Record<string, Headers> = {};
const roleId = randomUUID(), definitionId = randomUUID();
const volunteers: string[] = [];
const future = addDays(phoenixDate(), 40);
async function volunteer(options: { status?: "ACTIVE" | "INACTIVE"; role?: boolean; availability?: boolean } = {}) {
  const id = randomUUID(); volunteers.push(id);
  return db.volunteerProfile.create({ data: {
    id, displayName: `${prefix} ${volunteers.length}`, status: options.status ?? "ACTIVE",
    roles: options.role === false ? undefined : { create: { roleId } },
    availability: options.availability === false ? undefined : { create: { dayOfWeek: dayNumber(future), startMinute: 0, endMinute: 1440, validFrom: dateValue(future) } },
  } });
}
async function shift(start = 540, end = 720, capacity = 2) {
  return db.shift.create({ data: { definitionId, startsAt: localInstant(future, start), endsAt: localInstant(future, end), capacity } });
}
async function input(shiftId: string, volunteerId: string, acknowledgeAvailability = false) {
  const row = await db.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const candidate = (await getAssignmentCandidates(shiftId)).find(candidate => candidate.id === volunteerId)!;
  return { shiftId, shiftUpdatedAt: row.updatedAt.toISOString(), volunteerId, volunteerUpdatedAt: candidate.volunteerUpdatedAt, assignmentUpdatedAt: candidate.assignmentUpdatedAt, acknowledgeAvailability };
}
async function profileInput(id: string) {
  const row = (await getVolunteerEditor(id))!.volunteer!;
  return { id, updatedAt: row.updatedAt.toISOString(), displayName: row.displayName, status: row.status, email: row.email ?? "", roleIds: row.roles.map(role => role.roleId), foodHandlerIssuedOn: "", foodHandlerExpiresOn: "", availability: [] };
}
const versionOf = (row: { id: string; updatedAt: Date }) => ({ id: row.id, updatedAt: row.updatedAt.toISOString() });

// Instrument only transaction entry/query timing. All reads, locks and writes
// still execute against PostgreSQL on separate pooled transaction connections.
function instrument(hook: (sql: string) => Promise<void>, after?: (tx: Prisma.TransactionClient) => Promise<void>) {
  const original = db.$transaction.bind(db);
  return vi.spyOn(db, "$transaction").mockImplementation(((callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) => original(async tx => {
    const wrapped = new Proxy(tx, { get(target, key) {
      if (key === "$queryRaw") return async (strings: TemplateStringsArray, ...values: unknown[]) => {
        await hook(strings.join("?"));
        return target.$queryRaw(strings, ...values);
      };
      return Reflect.get(target, key);
    } });
    const result = await callback(wrapped);
    if (after) await after(tx);
    return result;
  }, options)) as typeof db.$transaction);
}
async function race<T>(fragment: string, run: () => Promise<T>): Promise<T> {
  let count = 0;
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const spy = instrument(async sql => {
    if (sql.includes(fragment)) {
      if (++count === 2) release();
      await ready;
    }
  });
  try { const result = await run(); expect(count).toBe(2); return result; }
  finally { release(); spy.mockRestore(); }
}

beforeAll(async () => {
  const url = readDatabaseUrl(process.env, "TEST_DATABASE_URL");
  await verifyTarget(url, "test");
  const migration = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", "prisma.config.ts"], { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" });
  if (migration.status !== 0) throw new Error("Assignment test migration failed; no reset attempted.");
  db = createDatabaseClient(url);
  auth = createAuth(db, { BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"), NODE_ENV: "test" });
  const fixtures = betterAuth({ ...auth.options, emailAndPassword: { ...auth.options.emailAndPassword, enabled: true, disableSignUp: false, autoSignIn: false } });
  for (const name of ["ADMIN", "COORDINATOR", "COORDINATOR2", "VIEWER"] as const) {
    const password = randomBytes(24).toString("base64url"), email = `${prefix}-${name.toLowerCase()}@example.invalid`;
    const { user } = await fixtures.api.signUpEmail({ body: { email, password, name: prefix } });
    await db.user.update({ where: { id: user.id }, data: { role: name === "COORDINATOR2" ? "COORDINATOR" : name } });
    const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    sessions[name] = new Headers({ cookie: response.headers.getSetCookie().find(value => value.startsWith("better-auth.session_token="))!.split(";")[0] });
  }
  await db.volunteerRole.create({ data: { id: roleId, name: prefix } });
  await db.shiftDefinition.create({ data: { id: definitionId, name: prefix, roleId } });
  pageHeaders = sessions.ADMIN;
});
afterAll(async () => {
  if (!db) return;
  await db.shiftAssignment.deleteMany({ where: { volunteerId: { in: volunteers } } });
  await db.shift.deleteMany({ where: { definitionId } });
  await db.shiftPattern.deleteMany({ where: { definitionId } });
  await db.shiftDefinition.deleteMany({ where: { id: definitionId } });
  await db.availability.deleteMany({ where: { volunteerId: { in: volunteers } } });
  await db.volunteerRoleMembership.deleteMany({ where: { volunteerId: { in: volunteers } } });
  await db.volunteerProfile.deleteMany({ where: { id: { in: volunteers } } });
  await db.volunteerRole.deleteMany({ where: { id: roleId } });
  await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await db.$disconnect();
});

it("independently authorizes reads, assignments, cancellations and reactivations", async () => {
  const s = await shift(), v = await volunteer(), data = await input(s.id, v.id);
  for (const headers of [new Headers(), sessions.VIEWER]) {
    await request.run(headers, async () => {
      for (const command of ["assign", "cancel"] as const) {
        expect(await mutateAssignment(command, data)).toMatchObject({ ok: false, error: expect.stringMatching(/sign in|permission/) });
        expect(await assignmentAction(command, data)).toMatchObject({ ok: false });
      }
    });
  }
  await request.run(new Headers(), async () => { await expect(getAssignmentCandidates(s.id)).rejects.toMatchObject({ status: 401 }); });
  for (const role of ["ADMIN", "COORDINATOR"]) {
    const target = await shift();
    await request.run(sessions[role], async () => {
      expect(await assignmentAction("assign", await input(target.id, v.id))).toMatchObject({ ok: true });
      expect(await assignmentAction("cancel", await input(target.id, v.id))).toMatchObject({ ok: true });
      expect(await assignmentAction("assign", await input(target.id, v.id))).toMatchObject({ ok: true });
      expect(await assignmentAction("cancel", await input(target.id, v.id))).toMatchObject({ ok: true });
    });
  }
  expect(await mutateAssignment("assign", { ...data, shiftId: "bad" })).toMatchObject({ ok: false, fieldErrors: { shiftId: expect.any(String) } });
});
it("assigns successfully and rejects inactive volunteers, missing roles, missing records and forged eligibility", async () => {
  const s = await shift();
  for (const [options, error] of [[{ status: "INACTIVE" as const }, /inactive/], [{ role: false }, /required role/]] as const) {
    const v = await volunteer(options);
    expect(await mutateAssignment("assign", { ...await input(s.id, v.id), acknowledgeAvailability: true, status: "ACTIVE", roleIds: [roleId] })).toMatchObject({ ok: false, error: expect.stringMatching(error) });
  }
  const v = await volunteer();
  const data = await input(s.id, v.id);
  expect(await mutateAssignment("assign", { ...data, shiftId: randomUUID() })).toMatchObject({ ok: false, error: expect.stringMatching(/no longer exists/) });
  expect(await mutateAssignment("assign", { ...data, volunteerId: randomUUID() })).toMatchObject({ ok: false, error: expect.stringMatching(/no longer exists/) });
  expect(await mutateAssignment("assign", data)).toMatchObject({ ok: true });
  expect(await mutateAssignment("assign", await input(s.id, v.id))).toMatchObject({ ok: false, error: expect.stringMatching(/already assigned/) });
});
it("allows existing scheduled shifts under inactive catalog entries without certificate policy", async () => {
  const s = await shift(), v = await volunteer();
  await db.shiftDefinition.update({ where: { id: definitionId }, data: { isActive: false } });
  await db.volunteerRole.update({ where: { id: roleId }, data: { isActive: false } });
  try { expect(await mutateAssignment("assign", await input(s.id, v.id))).toMatchObject({ ok: true }); }
  finally {
    await db.shiftDefinition.update({ where: { id: definitionId }, data: { isActive: true } });
    await db.volunteerRole.update({ where: { id: roleId }, data: { isActive: true } });
  }
});
it("rejects canceled, completed, started shifts and historical assignment cancellation", async () => {
  const v = await volunteer();
  for (const status of ["CANCELLED", "COMPLETED", "SCHEDULED"] as const) {
    let s = await shift();
    s = await db.shift.update({ where: { id: s.id }, data: { status, ...(status === "SCHEDULED" ? { startsAt: new Date(Date.now() - 1000) } : {}) } });
    expect(await mutateAssignment("assign", await input(s.id, v.id))).toMatchObject({ ok: false, error: expect.stringMatching(/started|Completed and canceled/) });
    await db.shiftAssignment.create({ data: { shiftId: s.id, volunteerId: v.id } });
    expect(await mutateAssignment("cancel", await input(s.id, v.id))).toMatchObject({ ok: false });
  }
});
it("cancels without deleting history and reactivates the same row with current eligibility", async () => {
  const s = await shift(540, 720, 1), v = await volunteer(), second = await volunteer();
  expect(await mutateAssignment("assign", await input(s.id, v.id))).toMatchObject({ ok: true });
  const before = await db.shiftAssignment.findUniqueOrThrow({ where: { shiftId_volunteerId: { shiftId: s.id, volunteerId: v.id } } });
  expect(await mutateAssignment("assign", await input(s.id, second.id))).toMatchObject({ ok: false, error: "This shift is full." });
  const oldCancel = await input(s.id, v.id);
  expect(await mutateAssignment("cancel", oldCancel)).toMatchObject({ ok: true });
  const canceled = await db.shiftAssignment.findUniqueOrThrow({ where: { id: before.id } });
  expect(canceled).toMatchObject({ ...before, status: "CANCELLED", updatedAt: expect.any(Date) });
  expect(canceled.updatedAt > before.updatedAt).toBe(true);
  expect(await mutateScheduling("cancelShift", versionOf(s))).toMatchObject({ ok: false, error: expect.stringContaining("Assignment history") });
  expect(await mutateAssignment("assign", await input(s.id, second.id))).toMatchObject({ ok: true });
  expect(await mutateAssignment("assign", await input(s.id, v.id))).toMatchObject({ ok: false, error: "This shift is full." });
  expect(await mutateAssignment("cancel", await input(s.id, second.id))).toMatchObject({ ok: true });
  expect(await mutateAssignment("assign", await input(s.id, v.id))).toMatchObject({ ok: true });
  expect(await mutateAssignment("cancel", oldCancel)).toMatchObject({ ok: false, error: expect.stringMatching(/changed/) });
  const restored = await db.shiftAssignment.findUniqueOrThrow({ where: { id: before.id } });
  expect(restored).toMatchObject({ id: before.id, createdAt: before.createdAt, volunteerId: v.id, status: "ASSIGNED" });
  expect(await db.shiftAssignment.count({ where: { shiftId: s.id, volunteerId: v.id } })).toBe(1);
});
it("never reactivates completed assignments or stale canceled rows", async () => {
  const s = await shift(), v = await volunteer();
  const row = await db.shiftAssignment.create({ data: { shiftId: s.id, volunteerId: v.id, status: "COMPLETED" } });
  expect(await mutateAssignment("assign", await input(s.id, v.id))).toMatchObject({ ok: false, error: expect.stringMatching(/Completed/) });
  expect(await mutateAssignment("cancel", await input(s.id, v.id))).toMatchObject({ ok: false });
  expect(await db.shiftAssignment.findUnique({ where: { id: row.id } })).toEqual(row);
});
it("uses actual intervals, rejects overlap and permits adjacent shifts and historical statuses", async () => {
  const v = await volunteer(), first = await shift(540, 600);
  expect(await mutateAssignment("assign", await input(first.id, v.id))).toMatchObject({ ok: true });
  const overlapping = await shift(599, 720), adjacent = await shift(600, 720);
  expect(await mutateAssignment("assign", await input(overlapping.id, v.id))).toMatchObject({ ok: false, error: "This volunteer is already scheduled during this time." });
  expect(await mutateAssignment("assign", await input(adjacent.id, v.id))).toMatchObject({ ok: true });
  for (const status of ["CANCELLED", "COMPLETED"] as const) {
    await db.shiftAssignment.updateMany({ where: { volunteerId: v.id }, data: { status } });
    const target = await shift(540, 720);
    expect(await mutateAssignment("assign", await input(target.id, v.id))).toMatchObject({ ok: true });
  }
});
it("requires server acknowledgment for both outside and unknown availability", async () => {
  const s = await shift();
  for (const kind of ["OUTSIDE", "UNCONFIRMED"] as const) {
    const v = await volunteer({ availability: kind !== "UNCONFIRMED" });
    if (kind === "OUTSIDE") await db.availability.updateMany({ where: { volunteerId: v.id }, data: { endMinute: 540 } });
    const data = await input(s.id, v.id);
    expect(await mutateAssignment("assign", data)).toMatchObject({ ok: false, availability: kind, fieldErrors: { acknowledgeAvailability: expect.any(String) } });
    expect(await db.shiftAssignment.count({ where: { volunteerId: v.id } })).toBe(0);
    expect(await mutateAssignment("assign", { ...data, acknowledgeAvailability: true })).toMatchObject({ ok: true });
  }
});
it("rechecks current availability and role membership when reactivating", async () => {
  const s = await shift(), v = await volunteer();
  await db.shiftAssignment.create({ data: { shiftId: s.id, volunteerId: v.id, status: "CANCELLED" } });
  const data = await input(s.id, v.id);
  expect(await saveVolunteer("update", { ...await profileInput(v.id), roleIds: [] })).toMatchObject({ ok: true });
  expect(await mutateAssignment("assign", { ...data, acknowledgeAvailability: true })).toMatchObject({ ok: false, error: expect.stringMatching(/changed/) });
  expect(await mutateAssignment("assign", await input(s.id, v.id, true))).toMatchObject({ ok: false, error: expect.stringMatching(/required role/) });
  expect(await saveVolunteer("update", { ...await profileInput(v.id), roleIds: [roleId] })).toMatchObject({ ok: true });
  expect(await mutateAssignment("assign", await input(s.id, v.id))).toMatchObject({ ok: false, availability: "UNCONFIRMED" });
});
it("renders staffing and history for VIEWER without mutation controls", async () => {
  const s = await shift(540, 720, 3), a = await volunteer(), b = await volunteer(), c = await volunteer();
  await db.shiftAssignment.createMany({ data: [{ shiftId: s.id, volunteerId: a.id }, { shiftId: s.id, volunteerId: b.id, status: "CANCELLED" }, { shiftId: s.id, volunteerId: c.id, status: "COMPLETED" }] });
  const props = { params: Promise.resolve({ id: s.id }), searchParams: Promise.resolve({}) };
  await request.run(sessions.VIEWER, async () => {
    const html = renderToStaticMarkup(await ShiftPage(props));
    expect(html).toContain("1 of 3 spots filled"); expect(html).toContain("2 remaining");
    expect(html).toContain("Assignment history (2)"); expect(html).toContain("Canceled"); expect(html).toContain("Completed");
    expect(html).not.toContain("Assign volunteer"); expect(html).not.toContain("Cancel assignment");
  });
  const html = renderToStaticMarkup(await ShiftPage(props));
  expect(html).toContain("Assign volunteer"); expect(html).toContain("Cancel assignment");
  expect(html).not.toContain("Save shift changes");
});
it("revalidates only successful assignment actions", async () => {
  const s = await shift(), v = await volunteer({ availability: false });
  vi.mocked(revalidatePath).mockClear();
  expect(await assignmentAction("assign", await input(s.id, v.id))).toMatchObject({ ok: false });
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(await assignmentAction("assign", await input(s.id, v.id, true))).toMatchObject({ ok: true });
  expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/admin"], ["/admin/scheduling"], [`/admin/scheduling/${s.id}`]]);
});
it("rolls back successful insert, cancellation and reactivation on PostgreSQL failure", async () => {
  const s = await shift(), v = await volunteer();
  for (const command of ["assign", "cancel", "assign"] as const) {
    const data = await input(s.id, v.id);
    const before = await db.shiftAssignment.findMany({ where: { shiftId: s.id } });
    const spy = instrument(async () => {}, async tx => { await tx.$executeRawUnsafe("SELECT 1 / 0"); });
    try { expect(await mutateAssignment(command, data)).toMatchObject({ ok: false, error: expect.stringMatching(/Unable to save/) }); }
    finally { spy.mockRestore(); }
    expect(await db.shiftAssignment.findMany({ where: { shiftId: s.id } })).toEqual(before);
    expect(await mutateAssignment(command, data)).toMatchObject({ ok: true });
  }
});
it("serializes two coordinators competing for the final capacity slot", async () => {
  const s = await shift(540, 720, 1), a = await volunteer(), b = await volunteer();
  const inputs = await Promise.all([input(s.id, a.id), input(s.id, b.id)]);
  const results = await race('FROM "Shift"', () => Promise.all(inputs.map((data, i) => request.run(sessions[i ? "COORDINATOR2" : "COORDINATOR"], () => mutateAssignment("assign", data)))));
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(results.find(result => !result.ok)).toMatchObject({ error: "This shift is full." });
  expect(await db.shiftAssignment.count({ where: { shiftId: s.id, status: "ASSIGNED" } })).toBe(1);
});
it("serializes one volunteer assigned concurrently to overlapping different shifts", async () => {
  const a = await shift(), b = await shift(600, 780), v = await volunteer();
  const inputs = await Promise.all([input(a.id, v.id), input(b.id, v.id)]);
  const results = await race('FROM "VolunteerProfile"', () => Promise.all(inputs.map(data => mutateAssignment("assign", data))));
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(results.find(result => !result.ok)).toMatchObject({ error: "This volunteer is already scheduled during this time." });
  expect(await db.shiftAssignment.count({ where: { volunteerId: v.id, status: "ASSIGNED" } })).toBe(1);
});
it("permits concurrent adjacent shifts and serializes duplicate assignment requests", async () => {
  const a = await shift(540, 600), b = await shift(600, 720), v = await volunteer();
  const inputs = await Promise.all([input(a.id, v.id), input(b.id, v.id)]);
  expect((await race('FROM "VolunteerProfile"', () => Promise.all(inputs.map(data => mutateAssignment("assign", data))))).every(result => result.ok)).toBe(true);
  const c = await shift(), other = await volunteer(), data = await input(c.id, other.id);
  const results = await race('FROM "Shift"', () => Promise.all([mutateAssignment("assign", data), mutateAssignment("assign", data)]));
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(await db.shiftAssignment.count({ where: { shiftId: c.id } })).toBe(1);
});
it("serializes assignment versus shift cancellation and rescheduling", async () => {
  for (const command of ["cancelShift", "editShift"] as const) {
    const s = await shift(), v = await volunteer(), data = await input(s.id, v.id);
    const change = { ...versionOf(s), date: future, endDate: future, start: "15:00", end: "16:00", capacity: 1 };
    const results = await race('FROM "Shift"', () => Promise.all([mutateAssignment("assign", data), mutateScheduling(command, change)]));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    const row = (await getShift(s.id))!.shift;
    if (row.assignments.length) { expect(row.status).toBe("SCHEDULED"); expect(row.startsAt).toEqual(s.startsAt); }
  }
});
it("serializes cancellation versus reactivation and rejects stale retries", async () => {
  const s = await shift(), v = await volunteer();
  expect(await mutateAssignment("assign", await input(s.id, v.id))).toMatchObject({ ok: true });
  const data = await input(s.id, v.id);
  const results = await race('FROM "Shift"', () => Promise.all([mutateAssignment("cancel", data), mutateAssignment("assign", data)]));
  expect(results[0]).toMatchObject({ ok: true }); expect(results[1]).toMatchObject({ ok: false });
  const canceled = await input(s.id, v.id);
  const restores = await race('FROM "Shift"', () => Promise.all([mutateAssignment("assign", canceled), mutateAssignment("assign", canceled)]));
  expect(restores.filter(result => result.ok)).toHaveLength(1);
  expect(await mutateAssignment("cancel", data)).toMatchObject({ ok: false, error: expect.stringMatching(/changed/) });
});
it("serializes assignment against volunteer profile deactivation, membership and availability saves", async () => {
  for (const mode of ["inactive", "roles", "availability"] as const) {
    const s = await shift(), v = await volunteer(), data = await input(s.id, v.id);
    const edit = { ...await profileInput(v.id), ...(mode === "inactive" ? { status: "INACTIVE" as const } : mode === "roles" ? { roleIds: [] } : {}) };
    // Hold the real profile-save transaction open after its SQL writes. Start
    // assignment while those changes are uncommitted, then release the save.
    let release!: () => void, written!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { written = resolve; });
    let first = true;
    const original = db.$transaction.bind(db);
    const spy = vi.spyOn(db, "$transaction").mockImplementation(((callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) => {
      const hold = first; first = false;
      return original(async tx => { const result = await callback(tx); if (hold) { written(); await held; } return result; }, options);
    }) as typeof db.$transaction);
    try {
      const saving = saveVolunteer("update", edit);
      await ready;
      const assigning = mutateAssignment("assign", { ...data, acknowledgeAvailability: true });
      // Verify an actual PostgreSQL lock wait before committing the save.
      const deadline = Date.now() + 3000;
      let blocked = false;
      while (Date.now() < deadline) {
        const rows = await db.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'SELECT id FROM "VolunteerProfile"%') AS blocked`;
        if (rows[0].blocked) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      expect(blocked).toBe(true);
      release();
      expect(await saving).toMatchObject({ ok: true });
      expect(await assigning).toMatchObject({ ok: false, error: expect.stringMatching(/changed/) });
      expect(await db.shiftAssignment.count({ where: { shiftId: s.id } })).toBe(0);
    } finally { release(); spy.mockRestore(); }
  }
});
it("honors pattern-first locking when assigning versus bulk cancellation", async () => {
  const pattern = await db.shiftPattern.create({ data: { definitionId, dayOfWeek: dayNumber(future), startMinute: 540, durationMinutes: 180, capacity: 2, validFrom: dateValue(future) } });
  const s = await db.shift.create({ data: { definitionId, patternId: pattern.id, occurrenceDate: dateValue(future), startsAt: localInstant(future, 540), endsAt: localInstant(future, 720), capacity: 2 } });
  const v = await volunteer(), data = await input(s.id, v.id);
  const results = await race('FROM "ShiftPattern"', () => Promise.all([mutateAssignment("assign", data), mutateScheduling("cancelPattern", versionOf(pattern))]));
  expect(results.filter(result => result.ok)).toHaveLength(1);
  const row = (await getShift(s.id))!.shift;
  expect(row.assignments.length ? row.status === "SCHEDULED" : row.status === "CANCELLED").toBe(true);
});

it("evaluates actual overnight availability and non-Phoenix windows through assignment submission", async () => {
  const s = await shift(1380, 1439), v = await volunteer({ availability: false });
  const overnight = await db.shift.update({ where: { id: s.id }, data: { endsAt: localInstant(addDays(future, 1), 60) } });
  await db.availability.createMany({ data: [
    { volunteerId: v.id, dayOfWeek: dayNumber(future), startMinute: 1380, endMinute: 1440, validFrom: dateValue(future), validUntil: dateValue(future) },
    { volunteerId: v.id, dayOfWeek: dayNumber(addDays(future, 1)), startMinute: 0, endMinute: 60, validFrom: dateValue(addDays(future, 1)), validUntil: dateValue(addDays(future, 1)) },
  ] });
  expect((await getAssignmentCandidates(s.id)).find(candidate => candidate.id === v.id)?.availability).toBe("AVAILABLE");
  expect(await mutateAssignment("assign", await input(overnight.id, v.id))).toMatchObject({ ok: true });
  const other = await volunteer({ availability: false }), target = await shift();
  await db.availability.create({ data: { volunteerId: other.id, dayOfWeek: dayNumber(future), startMinute: 0, endMinute: 1440, timeZone: "America/New_York", validFrom: dateValue(future) } });
  expect(await mutateAssignment("assign", await input(target.id, other.id))).toMatchObject({ ok: false, availability: "UNCONFIRMED" });
  expect(await mutateAssignment("assign", await input(target.id, other.id, true))).toMatchObject({ ok: true });
});
it("does not let canceled-assignment reactivation bypass inactivity or overlaps", async () => {
  const s = await shift(), other = await shift(600, 780), v = await volunteer();
  await db.shiftAssignment.create({ data: { shiftId: s.id, volunteerId: v.id, status: "CANCELLED" } });
  expect(await mutateAssignment("assign", await input(other.id, v.id))).toMatchObject({ ok: true });
  expect(await mutateAssignment("assign", await input(s.id, v.id, true))).toMatchObject({ ok: false, error: expect.stringMatching(/scheduled during/) });
  expect(await mutateAssignment("cancel", await input(other.id, v.id))).toMatchObject({ ok: true });
  expect(await saveVolunteer("update", { ...await profileInput(v.id), status: "INACTIVE" })).toMatchObject({ ok: true });
  expect(await mutateAssignment("assign", await input(s.id, v.id, true))).toMatchObject({ ok: false, error: expect.stringMatching(/inactive/) });
  expect(await db.shiftAssignment.findFirst({ where: { shiftId: s.id, volunteerId: v.id } })).toMatchObject({ status: "CANCELLED" });
});
it("uses identical pattern, shift, volunteer, assignment lock order for assign, cancel and reactivate", async () => {
  const pattern = await db.shiftPattern.create({ data: { definitionId, dayOfWeek: dayNumber(future), startMinute: 540, durationMinutes: 180, capacity: 2, validFrom: dateValue(future) } });
  const s = await db.shift.create({ data: { definitionId, patternId: pattern.id, occurrenceDate: dateValue(future), startsAt: localInstant(future, 540), endsAt: localInstant(future, 720), capacity: 2 } });
  const v = await volunteer();
  for (const command of ["assign", "cancel", "assign"] as const) {
    const queries: string[] = [];
    const spy = instrument(async sql => { queries.push(sql); });
    try { expect(await mutateAssignment(command, await input(s.id, v.id))).toMatchObject({ ok: true }); }
    finally { spy.mockRestore(); }
    expect(queries.map(sql => /FROM "(\w+)"/.exec(sql)?.[1])).toEqual(["ShiftPattern", "Shift", "VolunteerProfile", "ShiftAssignment"]);
    expect(queries.every(sql => sql.endsWith("FOR UPDATE"))).toBe(true);
  }
});
it("serializes cancellation freeing the final slot against assigning a replacement", async () => {
  const s = await shift(540, 720, 1), a = await volunteer(), b = await volunteer();
  expect(await mutateAssignment("assign", await input(s.id, a.id))).toMatchObject({ ok: true });
  const cancel = await input(s.id, a.id), assign = await input(s.id, b.id);
  const results = await race('FROM "Shift"', () => Promise.all([mutateAssignment("cancel", cancel), mutateAssignment("assign", assign)]));
  expect(results[0]).toMatchObject({ ok: true });
  if (!results[1].ok) expect(results[1].error).toBe("This shift is full.");
  expect(await db.shiftAssignment.count({ where: { shiftId: s.id, status: "ASSIGNED" } })).toBe(results[1].ok ? 1 : 0);
  expect(await db.shiftAssignment.count({ where: { shiftId: s.id, volunteerId: a.id, status: "CANCELLED" } })).toBe(1);
});
it("preserves assignments when a subsequent profile save changes eligibility", async () => {
  const s = await shift(), v = await volunteer();
  expect(await mutateAssignment("assign", await input(s.id, v.id))).toMatchObject({ ok: true });
  const before = await db.shiftAssignment.findFirstOrThrow({ where: { shiftId: s.id } });
  expect(await saveVolunteer("update", { ...await profileInput(v.id), status: "INACTIVE", roleIds: [] })).toMatchObject({ ok: true });
  expect(await db.shiftAssignment.findUnique({ where: { id: before.id } })).toEqual(before);
  // Historical preservation does not prevent coordinators canceling this future assignment.
  expect(await mutateAssignment("cancel", await input(s.id, v.id))).toMatchObject({ ok: true });
});
