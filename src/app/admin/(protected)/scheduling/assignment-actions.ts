"use server";
import { unstable_rethrow } from "next/navigation";
import { logUnexpectedFailure } from "@/server/diagnostics";
import { revalidatePath } from "next/cache";
import { mutateAssignment } from "@/server/scheduling/assignments";
import type { AssignmentCommand } from "@/server/scheduling/assignment-validation";

export async function assignmentAction(command: AssignmentCommand, input: unknown) {
  const result = await mutateAssignment(command, input);
  if (result.ok) {
    try {
      revalidatePath("/admin");
      revalidatePath("/admin/scheduling");
      revalidatePath(`/admin/scheduling/${result.shiftId}`);
    } catch (error) {
      unstable_rethrow(error);
      const reference = logUnexpectedFailure("assignments.response", error);
      return { ok: false as const, error: `Your change was saved, but the page could not be updated. Inspect the shift before trying again. Reference: ${reference}` };
    }
  }
  return result;
}
