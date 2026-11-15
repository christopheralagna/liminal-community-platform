"use server";
import { redirect, RedirectType, unstable_rethrow } from "next/navigation";
import { logUnexpectedFailure } from "@/server/diagnostics";
import { revalidatePath } from "next/cache";
import { mutateScheduling, type SchedulingCommand } from "@/server/scheduling/service";
export async function schedulingAction(command: SchedulingCommand, input: unknown, navigate = false) {
  const result = await mutateScheduling(command, input);
  if (result.ok) {
    try {
      revalidatePath("/admin");
      revalidatePath("/admin/scheduling");
      revalidatePath("/admin/scheduling/patterns");
      if (command === "createShift" || command === "editShift" || command === "updateCapacity" || command === "cancelShift") {
        revalidatePath(`/admin/scheduling/${result.id}`);
      } else if (["definition", "updateDefinition", "deleteDefinition"].includes(command)) {
        revalidatePath("/admin/scheduling/types");
        revalidatePath(`/admin/scheduling/types/${result.id}`);
        revalidatePath("/admin/scheduling/[id]", "page");
        revalidatePath("/admin/scheduling/patterns/[id]", "page");
        revalidatePath("/admin/scheduling/new");
        revalidatePath("/admin/scheduling/patterns/new");
      } else {
        revalidatePath(`/admin/scheduling/patterns/${result.id}`);
        if (command === "shortenPattern" || command === "cancelPattern") revalidatePath("/admin/scheduling/[id]", "page");
      }
    } catch (error) {
      unstable_rethrow(error);
      const reference = logUnexpectedFailure("scheduling.response", error);
      return { ok: false as const, error: `Your change was saved, but the page could not be updated. Inspect the schedule before trying again. Reference: ${reference}` };
    }
  }
  if (result.ok && navigate) {
    if (["createShift", "editShift"].includes(command)) redirect(`/admin/scheduling/${result.id}?saved=1`, RedirectType.replace);
    if (command === "deleteDefinition") redirect("/admin/scheduling/types?deleted=1", RedirectType.replace);
    if (command === "definition" || command === "updateDefinition") redirect(`/admin/scheduling/types/${result.id}?saved=1`, RedirectType.replace);
    if (command === "createPattern") redirect(`/admin/scheduling/patterns/${result.id}?saved=1`, RedirectType.replace);
  }
  return result;
}
