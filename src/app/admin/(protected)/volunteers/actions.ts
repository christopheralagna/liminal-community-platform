"use server";
import { revalidatePath } from "next/cache";
import { saveVolunteer } from "@/server/volunteers/service";
import { redirect, RedirectType, unstable_rethrow } from "next/navigation";
import { logUnexpectedFailure } from "@/server/diagnostics";

export async function saveVolunteerAction(mode: "create" | "update", input: unknown) {
  const result = await saveVolunteer(mode, input);
  if (result.ok) {
    try {
      revalidatePath("/admin");
      revalidatePath("/admin/volunteers");
      revalidatePath(`/admin/volunteers/${result.id}`);
    } catch (error) {
      unstable_rethrow(error);
      const reference = logUnexpectedFailure("volunteers.response", error);
      return { ok: false as const, error: `Your volunteer information was saved, but the page could not be updated. Inspect the record before trying again. Reference: ${reference}` };
    }
    // Redirect control flow is outside error handling, after commit/revalidation.
    redirect(`/admin/volunteers/${result.id}?saved=1`, RedirectType.replace);
  }
  return result;
}
