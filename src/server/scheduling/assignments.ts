import "server-only";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { getDatabase } from "../db";
import { requirePermission } from "../auth/permissions";
import { AuthorizationError } from "../auth/authorization";
import { availabilityMessages, evaluateAvailability } from "./availability";
import { assignSchema, cancelAssignmentSchema, type AssignmentCandidate, type AssignmentCommand, type AssignmentResult } from "./assignment-validation";
import { validationFields } from "./validation";

class AssignmentError extends Error {}
const nextVersion = (previous: Date) => new Date(Math.max(Date.now(), previous.getTime() + 1));
function checkVersion(actual: Date | null, expected: string | null) {
  if ((actual?.toISOString() ?? null) !== expected) throw new AssignmentError("This information changed. Reload the shift before saving.");
}
export function assignmentRestriction(shift: { status: string; startsAt: Date }) {
  if (shift.status !== "SCHEDULED") return "Completed and canceled shifts cannot have their assignments changed.";
  if (shift.startsAt <= new Date()) return "This shift has started. Its assignments are read-only.";
  return null;
}
const overlapping = (shift: { id: string; startsAt: Date; endsAt: Date }) => ({
  status: "ASSIGNED" as const, shiftId: { not: shift.id },
  shift: { status: "SCHEDULED" as const, startsAt: { lt: shift.endsAt }, endsAt: { gt: shift.startsAt } },
});
function volunteerBlocker(volunteer: { status: string; roles: { roleId: string }[] }, roleId: string) {
  if (volunteer.status !== "ACTIVE") return "This volunteer is inactive.";
  if (!volunteer.roles.some(role => role.roleId === roleId)) return "This volunteer doesn't have the required role.";
  return null;
}

export async function getAssignmentCandidates(shiftId: string): Promise<AssignmentCandidate[]> {
  await requirePermission("scheduling:read");
  if (!z.uuid().safeParse(shiftId).success) return [];
  const db = getDatabase();
  const shift = await db.shift.findUnique({ where: { id: shiftId }, include: {
    definition: { select: { roleId: true } }, assignments: true,
  } });
  if (!shift) return [];
  const volunteers = await db.volunteerProfile.findMany({ orderBy: [{ displayName: "asc" }, { id: "asc" }], include: {
    roles: { select: { roleId: true } }, availability: true,
    assignments: { where: overlapping(shift), select: { id: true } },
  } });
  const full = shift.assignments.filter(row => row.status === "ASSIGNED").length >= shift.capacity;
  return volunteers.map(volunteer => {
    const existing = shift.assignments.find(row => row.volunteerId === volunteer.id);
    return {
      id: volunteer.id, name: volunteer.displayName, volunteerUpdatedAt: volunteer.updatedAt.toISOString(),
      assignmentUpdatedAt: existing?.updatedAt.toISOString() ?? null,
      blocker: assignmentRestriction(shift) || volunteerBlocker(volunteer, shift.definition.roleId)
        || (existing?.status === "ASSIGNED" ? "This volunteer is already assigned to this shift." : null)
        || (existing?.status === "COMPLETED" ? "This volunteer has a completed assignment for this shift." : null)
        || (full ? "This shift is full." : null)
        || (volunteer.assignments.length ? "This volunteer is already scheduled during this time." : null),
      availability: evaluateAvailability(shift.startsAt, shift.endsAt, volunteer.availability),
    };
  });
}

// Lock order for every operation: pattern (if any), shift, volunteer, assignment.
// Profile saves already lock the volunteer before changing memberships/windows.
// Never acquire locks on other shifts while holding a volunteer lock.
async function lockTarget(tx: Prisma.TransactionClient, shiftId: string, volunteerId: string) {
  const origin = await tx.shift.findUnique({ where: { id: shiftId }, select: { patternId: true } });
  if (origin?.patternId) await tx.$queryRaw`SELECT id FROM "ShiftPattern" WHERE id = ${origin.patternId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ${shiftId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "VolunteerProfile" WHERE id = ${volunteerId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "ShiftAssignment" WHERE "shiftId" = ${shiftId}::uuid AND "volunteerId" = ${volunteerId}::uuid FOR UPDATE`;
}

export async function mutateAssignment(command: AssignmentCommand, input: unknown): Promise<AssignmentResult> {
  try {
    await requirePermission("scheduling:write");
    if (command !== "assign" && command !== "cancel") throw new AssignmentError("Invalid assignment request.");
    const parsed = (command === "assign" ? assignSchema : cancelAssignmentSchema).safeParse(input);
    if (!parsed.success) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: validationFields(parsed.error) };
    const value = parsed.data;
    return await getDatabase().$transaction(async tx => {
      await lockTarget(tx, value.shiftId, value.volunteerId);
      const shift = await tx.shift.findUnique({ where: { id: value.shiftId }, include: { definition: { select: { roleId: true } } } });
      if (!shift) throw new AssignmentError("This shift no longer exists.");
      checkVersion(shift.updatedAt, value.shiftUpdatedAt);
      const restriction = assignmentRestriction(shift);
      if (restriction) throw new AssignmentError(restriction);
      const volunteer = await tx.volunteerProfile.findUnique({ where: { id: value.volunteerId }, include: { roles: true, availability: true } });
      if (!volunteer) throw new AssignmentError("This volunteer no longer exists.");
      const existing = await tx.shiftAssignment.findUnique({ where: { shiftId_volunteerId: { shiftId: shift.id, volunteerId: volunteer.id } } });
      checkVersion(existing?.updatedAt ?? null, value.assignmentUpdatedAt);
      if (command === "cancel") {
        if (existing?.status !== "ASSIGNED") throw new AssignmentError("Only an active assignment can be canceled.");
        await tx.shiftAssignment.update({ where: { id: existing.id }, data: { status: "CANCELLED", updatedAt: nextVersion(existing.updatedAt) } });
        return { ok: true, shiftId: shift.id, message: "This assignment has been canceled." };
      }
      const assign = assignSchema.parse(input);
      checkVersion(volunteer.updatedAt, assign.volunteerUpdatedAt);
      const blocker = volunteerBlocker(volunteer, shift.definition.roleId);
      if (blocker) throw new AssignmentError(blocker);
      if (existing?.status === "ASSIGNED") throw new AssignmentError("This volunteer is already assigned to this shift.");
      if (existing?.status === "COMPLETED") throw new AssignmentError("Completed assignments are read-only.");
      const filled = await tx.shiftAssignment.count({ where: { shiftId: shift.id, status: "ASSIGNED" } });
      if (filled >= shift.capacity) throw new AssignmentError("This shift is full.");
      if (await tx.shiftAssignment.findFirst({ where: { volunteerId: volunteer.id, ...overlapping(shift) }, select: { id: true } })) throw new AssignmentError("This volunteer is already scheduled during this time.");
      const availability = evaluateAvailability(shift.startsAt, shift.endsAt, volunteer.availability);
      if (availability !== "AVAILABLE" && !assign.acknowledgeAvailability) return {
        ok: false, error: `${availabilityMessages[availability]} Acknowledge this before assigning.`, availability,
        fieldErrors: { acknowledgeAvailability: "Acknowledgment is required." },
      };
      const finalRestriction = assignmentRestriction(shift);
      if (finalRestriction) throw new AssignmentError(finalRestriction);
      // Catalog inactivity does not invalidate existing scheduled shifts; roleId is fixed.
      if (existing) await tx.shiftAssignment.update({ where: { id: existing.id }, data: { status: "ASSIGNED", updatedAt: nextVersion(existing.updatedAt) } });
      else await tx.shiftAssignment.create({ data: { shiftId: shift.id, volunteerId: volunteer.id } });
      return { ok: true, shiftId: shift.id, message: existing ? "Volunteer assigned again." : "Volunteer assigned." };
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.status === 401 ? "Please sign in before saving." : "You do not have permission to manage assignments." };
    if (error instanceof AssignmentError) return { ok: false, error: error.message };
    return { ok: false, error: "Unable to save the assignment. Check the shift before trying again; your change may already have saved." };
  }
}
