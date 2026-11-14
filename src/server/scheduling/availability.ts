import { addDays, dateOnly, dayNumber, localInstant, phoenixDate, TIME_ZONE } from "./dates";

export type AvailabilityWindow = {
  dayOfWeek: number; startMinute: number; endMinute: number; timeZone: string;
  validFrom: Date; validUntil: Date | null;
};
export type AvailabilityResult = "AVAILABLE" | "OUTSIDE" | "UNCONFIRMED";
export const availabilityMessages: Record<AvailabilityResult, string> = {
  AVAILABLE: "Available within recorded availability.",
  OUTSIDE: "This shift is outside the volunteer's usual availability.",
  UNCONFIRMED: "Availability is unconfirmed or not recorded for this shift.",
};

// Phoenix-only conversion deliberately does not guess how other timezones map.
// Merge absolute windows, including adjacent windows and next-day midnight.
export function evaluateAvailability(startsAt: Date, endsAt: Date, windows: AvailabilityWindow[]): AvailabilityResult {
  if (!windows.length) return "UNCONFIRMED";
  const intervals: { start: number; end: number }[] = [];
  for (let date = phoenixDate(startsAt); date <= phoenixDate(new Date(endsAt.getTime() - 1)); date = addDays(date, 1)) {
    for (const window of windows) {
      if (window.timeZone !== TIME_ZONE || window.dayOfWeek !== dayNumber(date) || date < dateOnly(window.validFrom) || (window.validUntil && date > dateOnly(window.validUntil))) continue;
      intervals.push({
        start: localInstant(date, window.startMinute).getTime(),
        end: (window.endMinute === 1440 ? localInstant(addDays(date, 1), 0) : localInstant(date, window.endMinute)).getTime(),
      });
    }
  }
  let coveredUntil = startsAt.getTime();
  for (const interval of intervals.sort((a, b) => a.start - b.start)) {
    if (interval.start > coveredUntil) break;
    coveredUntil = Math.max(coveredUntil, interval.end);
    if (coveredUntil >= endsAt.getTime()) return "AVAILABLE";
  }
  // Unsupported windows may supply missing coverage; do not claim a mismatch.
  return windows.some(window => window.timeZone !== TIME_ZONE) ? "UNCONFIRMED" : "OUTSIDE";
}
