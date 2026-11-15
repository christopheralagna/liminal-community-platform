import "server-only";
import { randomUUID } from "node:crypto";

const operations = ["admin.read", "auth.read", "auth.request", "dashboard.read", "volunteers.read",
  "scheduling.read", "volunteers.create", "volunteers.update", "scheduling.mutate", "assignments.mutate",
  "volunteers.response", "scheduling.response", "assignments.response"] as const;
export type DiagnosticOperation = typeof operations[number];
const databaseCodes = new Set(["P1000", "P1001", "P1002", "P1008", "P1017", "P2002", "P2003", "P2010", "P2024", "P2028", "P2034"]);
const connectionCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE"]);

// Never serialize an error, stack, request, account, record ID, or caller context.
// Runtime checks also protect against accidental untyped callers and error getters.
export function logUnexpectedFailure(operation: DiagnosticOperation, error: unknown): string {
  const reference = randomUUID();
  let code: string | undefined;
  try {
    const candidate = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (typeof candidate === "string" && (databaseCodes.has(candidate) || connectionCodes.has(candidate))) code = candidate;
  } catch { /* An error getter must not prevent reporting the original failure. */ }
  const event = {
    event: "unexpected_failure",
    operation: operations.includes(operation) ? operation : "unknown",
    reference, timestamp: new Date().toISOString(),
    classification: code ? databaseCodes.has(code) ? "database" : "connection" : "unexpected",
    ...(code ? { code } : {}),
  };
  try { console.error(JSON.stringify(event)); }
  catch { /* A failed runtime log sink must not change the operation's result. */ }
  return reference;
}
