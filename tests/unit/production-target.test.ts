import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { approvalPhrase, assertApproval, assertProductionIdentity, productionTarget, validateProductionUrl } from "../../scripts/production-target";
import { fixtureDates } from "../../scripts/production-fixtures";
import { isOutsideRepository } from "../../scripts/production-backup";

const env = { NODE_ENV: "production" as const, P8_PRODUCTION_HOST: "ep-approved-123.us-east-2.aws.neon.tech" };
const target = productionTarget(env, "initialize");
const url = `postgresql://liminal_operator:private-placeholder@${target.host}/liminal_production?sslmode=verify-full`;

describe("production operator safety", () => {
  it("requires production, a direct approved endpoint and distinct operator roles", () => {
    expect(() => productionTarget({}, "migrate")).toThrow();
    expect(() => productionTarget({ ...env, NODE_ENV: "test" }, "admin")).toThrow();
    for (const host of ["localhost", "db.example.com", "ep-a-pooler.us-east-2.aws.neon.tech", ""]) expect(() => productionTarget({ ...env, P8_PRODUCTION_HOST: host }, "migrate")).toThrow();
    expect(() => productionTarget(env, "reset")).toThrow();
    expect(productionTarget(env, "migrate").role).toBe("liminal_migrator");
    expect(productionTarget(env, "backup").role).toBe("liminal_backup");
  });
  it("refuses URL redirection, local targets and TLS weakening without leaking credentials", () => {
    expect(validateProductionUrl(url, target)).toBe(url);
    for (const value of [url.replace("verify-full", "require"), url + "&sslmode=no-verify", url + "&host=localhost", url.replace(target.host, "localhost"), url.replace("liminal_operator:", "neondb_owner:"), url.replace("/liminal_production", "/liminal_test"), url.replace("postgresql:", "postgres:"), url + "#secret"]) {
      expect(() => validateProductionUrl(value, target)).toThrow("approved direct");
      try { validateProductionUrl(value, target); } catch (error) { expect(String(error)).not.toContain("private-placeholder"); }
    }
  });
  it("matches live database, role, primary status and PostgreSQL 17", () => {
    const identity = { database: target.database, username: target.role, version: 170006, recovery: false };
    expect(() => assertProductionIdentity(target, [identity])).not.toThrow();
    for (const change of [{ database: "neondb" }, { username: "liminal_migrator" }, { version: 180000 }, { recovery: true }]) expect(() => assertProductionIdentity(target, [{ ...identity, ...change }])).toThrow();
    expect(() => assertProductionIdentity(target, [])).toThrow();
  });
  it("requires operation-specific confirmation and backup attestation for writes", () => {
    expect(() => assertApproval(target, approvalPhrase(target), "BACKUP VERIFIED")).not.toThrow();
    expect(() => assertApproval(target, "yes", "BACKUP VERIFIED")).toThrow();
    expect(() => assertApproval(target, approvalPhrase(target), "")).toThrow();
    expect(() => assertApproval(target, approvalPhrase({ ...target, operation: "admin" }), "BACKUP VERIFIED")).toThrow();
  });
  it("refuses noninteractive execution before consuming credentials or connecting", () => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/production.ts", "admin"], { env: { ...process.env, ...env }, encoding: "utf8", input: "private-placeholder" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("private-placeholder");
    expect(result.stderr).toContain("command stopped");
  });
  it("rejects repository backup destinations and invalid fixture dates", () => {
    expect(isOutsideRepository("/repo/private", "/repo")).toBe(false);
    expect(isOutsideRepository("/repo", "/repo")).toBe(false);
    expect(isOutsideRepository("/repo-backups", "/repo")).toBe(true);
    expect(fixtureDates("2026-12-29")).toEqual(["2026-12-29", "2026-12-30", "2027-01-01", "2027-01-05"]);
    for (const date of ["2026-02-30", "bad", "2026-13-01"]) expect(() => fixtureDates(date)).toThrow();
  });
});
