import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it("production migration config has no fallback to the local dotenv target", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("P8_PRODUCTION_HOST", "ep-approved-123.us-east-2.aws.neon.tech");
  vi.stubEnv("DATABASE_URL", undefined);
  await expect(import("../../prisma.production.config")).rejects.toThrow("approved direct");
});
it("production migration config requires the migration identity even with a valid runtime URL", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("P8_PRODUCTION_HOST", "ep-approved-123.us-east-2.aws.neon.tech");
  vi.stubEnv("DATABASE_URL", "postgresql://liminal_runtime:placeholder@ep-approved-123.us-east-2.aws.neon.tech/liminal_production?sslmode=verify-full");
  await expect(import("../../prisma.production.config")).rejects.toThrow("approved direct");
});
