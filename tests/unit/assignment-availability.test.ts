import { describe, expect, it } from "vitest";
import { evaluateAvailability, type AvailabilityWindow } from "../../src/server/scheduling/availability";
import { dateValue, localInstant } from "../../src/server/scheduling/dates";
const date = "2027-01-04"; // Monday
const window = (overrides: Partial<AvailabilityWindow> = {}): AvailabilityWindow => ({ dayOfWeek: 1, startMinute: 540, endMinute: 720, timeZone: "America/Phoenix", validFrom: dateValue(date), validUntil: dateValue(date), ...overrides });
const evaluate = (windows: AvailabilityWindow[], start = 540, end = 720) => evaluateAvailability(localInstant(date, start), localInstant(date, end), windows);
describe("assignment availability", () => {
  it("covers exact half-open boundaries and inclusive effective dates", () => {
    expect(evaluate([window()])).toBe("AVAILABLE");
    expect(evaluate([window()], 540, 721)).toBe("OUTSIDE");
    expect(evaluate([window({ validFrom: dateValue("2027-01-05") })])).toBe("OUTSIDE");
    expect(evaluate([window({ validUntil: dateValue("2027-01-03") })])).toBe("OUTSIDE");
    expect(evaluate([window({ dayOfWeek: 2 })])).toBe("OUTSIDE");
  });
  it("merges adjacent and overlapping windows but preserves gaps", () => {
    expect(evaluate([window({ endMinute: 600 }), window({ startMinute: 600 })])).toBe("AVAILABLE");
    expect(evaluate([window({ endMinute: 601 }), window({ startMinute: 600 })])).toBe("AVAILABLE");
    expect(evaluate([window({ endMinute: 599 }), window({ startMinute: 600 })])).toBe("OUTSIDE");
    expect(evaluate([window()], 720, 780)).toBe("OUTSIDE");
  });
  it("covers overnight shifts with independently effective adjacent weekdays", () => {
    const windows = [window({ startMinute: 1380, endMinute: 1440 }), window({ dayOfWeek: 2, startMinute: 0, endMinute: 60, validFrom: dateValue("2027-01-05"), validUntil: null })];
    expect(evaluateAvailability(localInstant(date, 1380), localInstant("2027-01-05", 60), windows)).toBe("AVAILABLE");
    expect(evaluateAvailability(localInstant(date, 1380), localInstant("2027-01-05", 0), windows.slice(0, 1))).toBe("AVAILABLE");
    windows[1].validUntil = dateValue(date);
    expect(evaluateAvailability(localInstant(date, 1380), localInstant("2027-01-05", 60), windows)).toBe("OUTSIDE");
  });
  it("distinguishes missing or unsupported information from known mismatch", () => {
    expect(evaluate([])).toBe("UNCONFIRMED");
    expect(evaluate([window({ timeZone: "America/New_York" })])).toBe("UNCONFIRMED");
    expect(evaluate([window(), window({ timeZone: "America/New_York" })])).toBe("AVAILABLE");
    expect(evaluate([window({ endMinute: 600 }), window({ timeZone: "America/New_York" })])).toBe("UNCONFIRMED");
  });
});
