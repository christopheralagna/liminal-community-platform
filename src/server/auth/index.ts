import "server-only";
import { getDatabase } from "../db";
import { createAuth, createAuthHandler } from "./factory";
import { logUnexpectedFailure } from "../diagnostics";

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return instance ??= createAuth(getDatabase(), process.env);
}
export async function handleAuthRequest(request: Request) {
  try {
    const response = await createAuthHandler(getAuth())(request);
    if (response.status >= 500) {
      const reference = logUnexpectedFailure("auth.request", undefined);
      return Response.json({ message: "Authentication is temporarily unavailable.", reference }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return response;
  } catch (error) {
    const reference = logUnexpectedFailure("auth.request", error);
    return Response.json({ message: "Authentication is temporarily unavailable.", reference }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
