"use server";
import { revalidatePath } from "next/cache";
import { mutateAssignment } from "@/server/scheduling/assignments";
import type { AssignmentCommand } from "@/server/scheduling/assignment-validation";

export async function assignmentAction(command: AssignmentCommand, input: unknown) {
  const result = await mutateAssignment(command, input);
  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath("/admin/scheduling");
    revalidatePath(`/admin/scheduling/${result.shiftId}`);
  }
  return result;
}
