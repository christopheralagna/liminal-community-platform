import "server-only";
import { redirect } from "next/navigation";
import { AuthorizationError } from "../auth/authorization";
import { logUnexpectedFailure, type DiagnosticOperation } from "../diagnostics";

// Catch failures before rendering; never send database/auth exceptions to the UI.
export async function readAdminPage<T>(read: () => Promise<T>, operation: DiagnosticOperation = "admin.read") {
  try { return { data: await read(), error: null }; }
  catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.status === 401) redirect("/admin/login");
      return { data: null, error: "You do not have permission to view this information." };
    }
    const reference = logUnexpectedFailure(operation, error);
    return { data: null, error: `Administration is temporarily unavailable. Please try again later. Reference: ${reference}` };
  }
}
