import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { betterAuth } from "better-auth";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDatabaseClient } from "../../src/server/database/client";
import { readDatabaseUrl } from "../../src/server/database/environment";
import { verifyTarget } from "../../scripts/database-target";
import { createAuth } from "../../src/server/auth/factory";
import { getDashboard } from "../../src/server/admin/dashboard";
import DashboardPage from "../../src/app/admin/(protected)/page";
import ShiftPage from "../../src/app/admin/(protected)/scheduling/[id]/page";
import type { AssignmentStatus, Prisma, VolunteerStatus } from "../../src/generated/prisma/client";

let pageHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => pageHeaders }));
vi.mock("../../src/server/db", () => ({ getDatabase: () => db }));
vi.mock("../../src/server/auth/index", () => ({ getAuth: () => auth }));
// Supply the page's clock without changing real session expiration or database time.
vi.mock("../../src/server/admin/queries", () => ({ getDashboard: () => dashboardRead() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));

let db: ReturnType<typeof createDatabaseClient>;
let auth: ReturnType<typeof createAuth>;
const now = new Date("2080-06-01T22:00:00.000Z"); // June 1, 3 PM in Phoenix.
const end = new Date("2080-06-08T22:00:00.000Z");
const prefix = `dashboard-test-${randomUUID()}`;
const roleId = randomUUID(), definitionId = randomUUID();
const volunteers: string[] = [];
const sessions: Record<string, Headers> = {};
const users: Record<string, string> = {};
let dashboardRead = () => getDashboard(now);
const instant = (hours: number) => new Date(now.getTime() + hours * 3600000);
async function shift(hours = 1, capacity = 3, extra: Partial<Prisma.ShiftUncheckedCreateInput> = {}) {
  return db.shift.create({ data: { definitionId, startsAt: instant(hours), endsAt: instant(hours + 2), capacity, ...extra } });
}
async function assign(shiftId: string, status: AssignmentStatus = "ASSIGNED", volunteerStatus: VolunteerStatus = "ACTIVE") {
  const volunteerId = randomUUID(); volunteers.push(volunteerId);
  await db.volunteerProfile.create({ data: { id: volunteerId, displayName: `${prefix} private volunteer`, status: volunteerStatus } });
  return db.shiftAssignment.create({ data: { shiftId, volunteerId, status } });
}

beforeAll(async () => {
  const url = readDatabaseUrl(process.env, "TEST_DATABASE_URL");
  await verifyTarget(url, "test");
  const migration = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", "prisma.config.ts"], { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" });
  if (migration.status !== 0) throw new Error("Dashboard test migration failed; no reset attempted.");
  db = createDatabaseClient(url);
  auth = createAuth(db, { BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"), NODE_ENV: "test" });
  const fixtures = betterAuth({ ...auth.options, emailAndPassword: { ...auth.options.emailAndPassword, enabled: true, disableSignUp: false, autoSignIn: false } });
  for (const role of ["ADMIN", "COORDINATOR", "VIEWER"] as const) {
    const password = randomBytes(24).toString("base64url"), email = `${prefix}-${role.toLowerCase()}@example.invalid`;
    const { user } = await fixtures.api.signUpEmail({ body: { email, password, name: prefix } });
    users[role] = user.id;
    await db.user.update({ where: { id: user.id }, data: { role } });
    const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    sessions[role] = new Headers({ cookie: response.headers.getSetCookie().find(value => value.startsWith("better-auth.session_token="))!.split(";")[0] });
  }
  await db.volunteerRole.create({ data: { id: roleId, name: prefix } });
  await db.shiftDefinition.create({ data: { id: definitionId, name: prefix, roleId } });
  pageHeaders = sessions.ADMIN;
});

afterEach(async () => {
  vi.restoreAllMocks();
  dashboardRead = () => getDashboard(now);
  pageHeaders = sessions.ADMIN;
  if (!db) return;
  await db.shiftAssignment.deleteMany({ where: { shift: { definitionId } } });
  await db.shift.deleteMany({ where: { definitionId } });
  await db.shiftPattern.deleteMany({ where: { definitionId } });
  await db.volunteerProfile.deleteMany({ where: { id: { in: volunteers } } });
  volunteers.length = 0;
  await db.shiftDefinition.update({ where: { id: definitionId }, data: { isActive: true } });
  await db.volunteerRole.update({ where: { id: roleId }, data: { isActive: true } });
  await db.user.update({ where: { id: users.COORDINATOR }, data: { role: "COORDINATOR", isActive: true } });
});
afterAll(async () => {
  if (!db) return;
  await db.shiftDefinition.deleteMany({ where: { id: definitionId } });
  await db.volunteerRole.deleteMany({ where: { id: roleId } });
  await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await db.$disconnect();
});

it("counts ACTIVE profiles independently of current staffing", async () => {
  const baseline = (await getDashboard(now)).activeVolunteers;
  const row = await shift();
  await assign(row.id);
  await assign(row.id, "ASSIGNED", "INACTIVE");
  expect((await getDashboard(now)).activeVolunteers).toBe(baseline + 1);
  await db.volunteerProfile.update({ where: { id: volunteers[0] }, data: { status: "INACTIVE" } });
  const updated = await getDashboard(now);
  expect(updated.activeVolunteers).toBe(baseline);
  expect(updated.upcoming[0]).toMatchObject({ assigned: 2, remaining: 1 });
});

it("distinguishes understaffed shifts from total open spots and ignores historical assignments", async () => {
  const unstaffed = await shift(1, 4), partial = await shift(2, 3), full = await shift(3, 1);
  await assign(partial.id); await assign(partial.id, "CANCELLED"); await assign(partial.id, "COMPLETED");
  await assign(full.id);
  const result = await getDashboard(now);
  expect(result).toMatchObject({ upcomingShifts: 3, shiftsNeedingCoverage: 2, openVolunteerSpots: 6 });
  expect(result.coverage.map(row => [row.id, row.assigned, row.remaining])).toEqual([[unstaffed.id, 0, 4], [partial.id, 1, 2]]);
  expect(result.upcoming[2]).toMatchObject({ id: full.id, assigned: 1, remaining: 0 });
  const html = renderToStaticMarkup(await DashboardPage());
  expect(html).toContain("No volunteers assigned"); expect(html).toContain("Partially staffed");
  expect(html).toContain("2 spots open"); expect(html).not.toContain("private volunteer");
});

it("excludes canceled/completed shifts and both exact window boundaries", async () => {
  await shift(-1); await shift(0); await shift(168); await shift(169);
  await shift(1, 1, { status: "CANCELLED" }); await shift(1, 1, { status: "COMPLETED" });
  const first = await shift(1 / 3600000), last = await shift(168 - 1 / 3600000);
  const result = await getDashboard(now);
  expect(result.windowStart).toEqual(now); expect(result.windowEnd).toEqual(end);
  expect(result.upcoming.map(row => row.id)).toEqual([first.id, last.id]);
  expect(result.upcomingShifts).toBe(2);
});

it("uses actual starts for moved recurring occurrences, including overnight shifts", async () => {
  const pattern = await db.shiftPattern.create({ data: { definitionId, dayOfWeek: 0, startMinute: 1380, durationMinutes: 120, capacity: 3, validFrom: new Date("2080-05-01T00:00:00Z") } });
  const row = await shift(8, 3, { patternId: pattern.id, occurrenceDate: new Date("2080-05-01T00:00:00Z") });
  await shift(-5, 3, { patternId: pattern.id, occurrenceDate: new Date("2080-06-02T00:00:00Z") });
  const result = await getDashboard(now);
  expect(result.upcoming.map(row => row.id)).toEqual([row.id]);
  const html = renderToStaticMarkup(await DashboardPage());
  expect(html).toContain("Jun 1, 2080, 11:00 PM"); expect(html).toContain("Jun 2, 2080, 1:00 AM");
});

it("includes future occurrences whose shift type and operational role are inactive", async () => {
  const row = await shift();
  await db.shiftDefinition.update({ where: { id: definitionId }, data: { isActive: false } });
  await db.volunteerRole.update({ where: { id: roleId }, data: { isActive: false } });
  expect((await getDashboard(now)).coverage[0]).toMatchObject({ id: row.id, name: prefix, role: prefix });
});

it("limits each list independently and keeps totals complete across tied batch boundaries", async () => {
  const full = await shift(0.5, 1); await assign(full.id);
  const ids = Array.from({ length: 205 }, () => randomUUID()).sort();
  await db.shift.createMany({ data: ids.map(id => ({ id, definitionId, startsAt: instant(1), endsAt: instant(2), capacity: 2 })) });
  const result = await getDashboard(now);
  expect(result).toMatchObject({ upcomingShifts: 206, shiftsNeedingCoverage: 205, openVolunteerSpots: 410 });
  expect(result.upcoming.map(row => row.id)).toEqual([full.id, ...ids.slice(0, 4)]);
  expect(result.coverage.map(row => row.id)).toEqual(ids.slice(0, 5));
  expect(await getDashboard(now)).toEqual(result);
  const html = renderToStaticMarkup(await DashboardPage());
  expect(html).toContain("Showing 5 of 205"); expect(html).toContain("Showing 5 of 206");
});

it("reports empty shift results without implying that future occurrences were generated", async () => {
  const result = await getDashboard(now);
  expect(result).toMatchObject({ upcomingShifts: 0, shiftsNeedingCoverage: 0, openVolunteerSpots: 0, upcoming: [], coverage: [] });
  const html = renderToStaticMarkup(await DashboardPage());
  expect(html).toContain("No upcoming scheduled shifts in the next 7 days.");
  expect(html).toContain("not been generated"); expect(html).not.toContain("fully staffed");
});

it("renders zero active volunteers and full coverage as separate empty states", async () => {
  const row = await shift(1, 1); await assign(row.id);
  const result = await getDashboard(now);
  expect(result).toMatchObject({ shiftsNeedingCoverage: 0, openVolunteerSpots: 0, coverage: [] });
  // Exercise the zero-profile presentation without deleting unrelated test records.
  dashboardRead = async () => ({ ...result, activeVolunteers: 0 });
  const html = renderToStaticMarkup(await DashboardPage());
  expect(html).toContain("No active volunteers are recorded.");
  expect(html).toContain("All upcoming shifts in this period are fully staffed.");
  expect(html).not.toContain("No upcoming scheduled shifts");
});

it.each(["ADMIN", "COORDINATOR", "VIEWER"])("provides authorized dashboard navigation for %s", async role => {
  const row = await shift();
  pageHeaders = sessions[role];
  expect((await getDashboard(now)).canWrite).toBe(role !== "VIEWER");
  const html = renderToStaticMarkup(await DashboardPage());
  expect(html).toContain("Next 7 days"); expect(html).toContain("America/Phoenix");
  expect(html).toContain('dateTime="2080-06-01T22:00:00.000Z"');
  expect(html).toContain("view=list&amp;from=2080-06-01&amp;until=2080-06-08&amp;canceled=0");
  expect(html).toContain(`href="/admin/scheduling/${row.id}#assignments"`);
  expect(html).toContain('href="/admin/volunteers"'); expect(html).toContain('href="/admin/scheduling/patterns"');
  for (const path of ["/admin/scheduling/new", "/admin/volunteers/new"]) expect(html.includes(`href="${path}"`)).toBe(role !== "VIEWER");
  expect(html.includes("Manage assignments")).toBe(role !== "VIEWER");
  if (role === "VIEWER") {
    expect(html).toContain("View assignments"); expect(html).not.toContain("Manage volunteers");
    const detail = renderToStaticMarkup(await ShiftPage({ params: Promise.resolve({ id: row.id }), searchParams: Promise.resolve({}) }));
    expect(detail).toContain('id="assignments"');
  }
});

it("denies unauthenticated and disabled users and reads role changes from current database state", async () => {
  pageHeaders = new Headers();
  await expect(getDashboard(now)).rejects.toMatchObject({ status: 401 });
  await expect(DashboardPage()).rejects.toThrow("REDIRECT:/admin/login");
  pageHeaders = sessions.COORDINATOR;
  await db.user.update({ where: { id: users.COORDINATOR }, data: { role: "VIEWER" } });
  expect((await getDashboard(now)).canWrite).toBe(false);
  await db.user.update({ where: { id: users.COORDINATOR }, data: { isActive: false } });
  // Better Auth rejects disabled users' sessions before the application role read.
  await expect(getDashboard(now)).rejects.toMatchObject({ status: 401 });
  await expect(DashboardPage()).rejects.toThrow("REDIRECT:/admin/login");
});

it("reflects committed changes on the next request", async () => {
  const row = await shift(1, 1);
  expect((await getDashboard(now)).openVolunteerSpots).toBe(1);
  const assignment = await assign(row.id);
  expect((await getDashboard(now)).openVolunteerSpots).toBe(0);
  await db.shiftAssignment.update({ where: { id: assignment.id }, data: { status: "CANCELLED" } });
  expect((await getDashboard(now)).openVolunteerSpots).toBe(1);
  await db.shift.update({ where: { id: row.id }, data: { status: "CANCELLED" } });
  expect((await getDashboard(now)).upcomingShifts).toBe(0);
});

it("keeps a consistent snapshot when assignments and occurrences change between batches", async () => {
  const activeBefore = (await getDashboard(now)).activeVolunteers;
  await db.shift.createMany({ data: Array.from({ length: 201 }, (_, i) => ({ definitionId, startsAt: instant(1 + i / 100), endsAt: instant(5), capacity: 1 })) });
  const original = db.$transaction.bind(db);
  let changed = false;
  vi.spyOn(db, "$transaction").mockImplementation(((callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) => original(async tx => {
    const wrapped = new Proxy(tx, { get(target, key) {
      if (key === "shift") return new Proxy(target.shift, { get(model, method) {
        if (method === "findMany") return async (args: Prisma.ShiftFindManyArgs) => {
          const rows = await model.findMany(args);
          if (!changed) {
            changed = true;
            await assign(rows[0].id);
            await shift(6, 10);
          }
          return rows;
        };
        return Reflect.get(model, method);
      } });
      return Reflect.get(target, key);
    } });
    return callback(wrapped);
  }, options)) as typeof db.$transaction);
  const result = await getDashboard(now);
  expect(changed).toBe(true);
  expect(result).toMatchObject({ activeVolunteers: activeBefore, upcomingShifts: 201, shiftsNeedingCoverage: 201, openVolunteerSpots: 201 });
  expect(result.upcoming[0].assigned).toBe(0);
  const next = await getDashboard(now);
  expect(next).toMatchObject({ activeVolunteers: activeBefore + 1, upcomingShifts: 202, shiftsNeedingCoverage: 201, openVolunteerSpots: 210 });
});

it("leaves occurrences, assignments and repeating schedules unchanged and enforces a read-only transaction", async () => {
  const row = await shift(); await assign(row.id, "CANCELLED");
  await db.shiftPattern.create({ data: { definitionId, dayOfWeek: 0, startMinute: 540, durationMinutes: 120, capacity: 2, validFrom: new Date("2080-05-01T00:00:00Z") } });
  const state = async () => ({
    shifts: await db.shift.findMany({ where: { definitionId } }),
    patterns: await db.shiftPattern.findMany({ where: { definitionId } }),
    assignments: await db.shiftAssignment.findMany({ where: { shift: { definitionId } } }),
  });
  const before = await state();
  await getDashboard(now); await DashboardPage();
  expect(await state()).toEqual(before);
  const original = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementation(((callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) => original(async tx => {
    const result = await callback(tx);
    await tx.shift.update({ where: { id: row.id }, data: { capacity: 99 } });
    return result;
  }, options)) as typeof db.$transaction);
  await expect(getDashboard(now)).rejects.toThrow(/read.only transaction/i);
  expect(await state()).toEqual(before);
});

it("shows an unavailable notice instead of fabricated zero metrics on read failure", async () => {
  dashboardRead = async () => { throw new Error("private database detail"); };
  const html = renderToStaticMarkup(await DashboardPage());
  expect(html).toContain("Administration is temporarily unavailable");
  expect(html).not.toContain("private database detail"); expect(html).not.toContain("Open volunteer spots");
});
