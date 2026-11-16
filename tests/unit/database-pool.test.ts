import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ attach: vi.fn(), adapter: vi.fn(), pool: vi.fn(), prisma: vi.fn() }));
vi.mock("@vercel/functions/db-connections", () => ({ attachDatabasePool: mocks.attach }));
vi.mock("pg", () => ({ Pool: class { constructor(options: unknown) { mocks.pool(options); } } }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class { constructor(pool: unknown, options: unknown) { mocks.adapter(pool, options); } } }));
vi.mock("../../src/generated/prisma/client", () => ({ PrismaClient: class { constructor(options: unknown) { mocks.prisma(options); } } }));
import { createDatabaseClient } from "../../src/server/database/client";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("bounds the shared adapter pool and retains CLI disposal ownership", () => {
  vi.stubEnv("VERCEL", undefined);
  createDatabaseClient("postgresql://placeholder");
  expect(mocks.pool).toHaveBeenCalledWith(expect.objectContaining({ max: 3, idleTimeoutMillis: 5000, connectionTimeoutMillis: 5000, enableChannelBinding: true }));
  expect(mocks.adapter).toHaveBeenCalledWith(expect.anything(), { disposeExternalPool: true });
  expect(mocks.attach).not.toHaveBeenCalled();
});
it("registers suspension cleanup only on Vercel", () => {
  vi.stubEnv("VERCEL", "1");
  createDatabaseClient("postgresql://placeholder");
  expect(mocks.attach).toHaveBeenCalledOnce();
  expect(mocks.adapter.mock.calls[0][0]).toBe(mocks.attach.mock.calls[0][0]);
});
