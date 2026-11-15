import { expect, it } from "vitest";
import { volunteerSchema, volunteerFieldErrors, volunteerFieldLabel } from "../../src/server/volunteers/validation";

it("maps profile, certificate and cross-window validation to correction controls", () => {
  const result = volunteerSchema.safeParse({
    id: "b4000000-0000-4000-8000-000000000100", updatedAt: "", displayName: " ", email: "", status: "ACTIVE", roleIds: [],
    foodHandlerIssuedOn: "2026-11-14", foodHandlerExpiresOn: "2026-11-13",
    availability: [0, 1].map(i => ({ id: `b4000000-0000-4000-8000-00000000010${i + 1}`, dayOfWeek: 1, start: "09:00", end: "12:00", timeZone: "America/Phoenix", validFrom: "2026-11-14", validUntil: "" })),
  });
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Expected invalid fixture");
  expect(volunteerFieldErrors(result.error)).toMatchObject({ displayName: "Enter a name.", foodHandlerExpiresOn: "Expiration cannot precede issuance.", "availability.1.start": expect.stringContaining("overlap") });
  expect(volunteerFieldLabel("availability.1.start")).toBe("Availability window 2: Start time");
});

it("keeps separate window errors addressable and handles collection-level feedback", () => {
  const result = volunteerSchema.safeParse({ availability: [{ start: "bad", end: "bad" }] });
  if (result.success) throw new Error("Expected invalid fixture");
  expect(volunteerFieldErrors(result.error)).toMatchObject({ "availability.0.start": expect.any(String), "availability.0.end": expect.any(String) });
  expect(volunteerFieldLabel("availability")).toBe("Weekly availability");
});
