import { z } from "zod";
import type { AvailabilityResult } from "./availability";

const target = { shiftId: z.uuid(), volunteerId: z.uuid(), shiftUpdatedAt: z.iso.datetime(), assignmentUpdatedAt: z.iso.datetime().nullable() };
export const assignSchema = z.object({ ...target, volunteerUpdatedAt: z.iso.datetime(), acknowledgeAvailability: z.boolean().default(false) });
export const cancelAssignmentSchema = z.object({ ...target, assignmentUpdatedAt: z.iso.datetime() });
export type AssignmentCommand = "assign" | "cancel";
export type AssignmentResult = { ok: true; shiftId: string; message: string } | {
  ok: false; error: string; fieldErrors?: Record<string, string>; availability?: AvailabilityResult;
};
export type AssignmentCandidate = {
  id: string; name: string; volunteerUpdatedAt: string; assignmentUpdatedAt: string | null;
  blocker: string | null; availability: AvailabilityResult;
};
