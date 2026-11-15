import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { logUnexpectedFailure } from "../../src/server/diagnostics";

afterEach(() => vi.restoreAllMocks());

describe("allowlisted operational diagnostics", () => {
  it("correlates a failure without serializing error messages, stacks, or extra properties", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "private-password-cookie-volunteer-postgresql://user:secret@host/db";
    const error = Object.assign(new Error(secret), { code: "P2028", meta: { secret }, body: secret, token: secret });
    const reference = logUnexpectedFailure("volunteers.update", error);
    const event = JSON.parse(output.mock.calls[0][0]);
    expect(event).toEqual({ event: "unexpected_failure", operation: "volunteers.update", reference,
      timestamp: expect.any(String), classification: "database", code: "P2028" });
    expect(reference).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(event.timestamp))).toBe(false);
    expect(JSON.stringify(output.mock.calls)).not.toContain(secret);
    expect(event).not.toHaveProperty("stack");
  });

  it("refuses arbitrary codes and operation names at runtime", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    logUnexpectedFailure("password-in-operation" as never, { code: "private-token", name: "private-name", message: "private-message" });
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ operation: "unknown", classification: "unexpected" });
    expect(JSON.stringify(output.mock.calls)).not.toMatch(/password-in-operation|private-/);
  });

  it("handles connection failures, unknown thrown values, and hostile properties safely", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const references = [
      logUnexpectedFailure("admin.read", { code: "ECONNREFUSED" }),
      logUnexpectedFailure("admin.read", "private thrown value"),
      logUnexpectedFailure("admin.read", { get code() { throw new Error("private getter"); } }),
    ];
    expect(new Set(references).size).toBe(3);
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ classification: "connection", code: "ECONNREFUSED" });
    expect(JSON.stringify(output.mock.calls)).not.toMatch(/private/);
  });

  it("does not turn a logging sink failure into another application failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => { throw new Error("sink unavailable"); });
    expect(() => logUnexpectedFailure("admin.read", new Error("original failure"))).not.toThrow();
  });
});
