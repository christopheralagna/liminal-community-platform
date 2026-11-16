// Operator tooling only. Deliberately does not load .env or accept URL arguments.
export type ProductionOperation = "status" | "migrate" | "initialize" | "admin" | "backup";
export type ProductionTarget = { host: string; database: string; role: string; operation: ProductionOperation };

export function productionTarget(env: Record<string, string | undefined>, operation: string): ProductionTarget {
  if (env.NODE_ENV !== "production" || !["status", "migrate", "initialize", "admin", "backup"].includes(operation)) {
    throw new Error("An explicit production operator environment and supported operation are required.");
  }
  const host = env.P8_PRODUCTION_HOST ?? "";
  if (!/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(host) || host.includes("-pooler.")) {
    throw new Error("Specify the approved direct Neon endpoint hostname.");
  }
  return { host, database: "liminal_production", role: operation === "migrate" || operation === "status" ? "liminal_migrator" : operation === "backup" ? "liminal_backup" : "liminal_operator", operation: operation as ProductionOperation };
}

export function validateProductionUrl(value: string, target: ProductionTarget): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgresql:" || url.hostname !== target.host || (url.port && url.port !== "5432") ||
        url.pathname !== `/${target.database}` || decodeURIComponent(url.username) !== target.role || !url.password || url.hash ||
        url.searchParams.get("sslmode") !== "verify-full" ||
        Array.from(url.searchParams).some(([key]) => key !== "sslmode") || url.searchParams.getAll("sslmode").length !== 1) throw new Error();
    return value;
  } catch { throw new Error("Connection must match the approved direct host/database/role and use sslmode=verify-full only."); }
}

export function assertProductionIdentity(target: ProductionTarget, rows: { database: string; username: string; version: number; recovery: boolean }[]) {
  const row = rows[0];
  if (rows.length !== 1 || row.database !== target.database || row.username !== target.role ||
      row.version < 170000 || row.version >= 180000 || row.recovery !== false) throw new Error("Live production identity or PostgreSQL version mismatch.");
}

export function approvalPhrase(target: ProductionTarget) {
  return `APPROVE ${target.operation} ${target.host}/${target.database} AS ${target.role}`;
}

export function assertApproval(target: ProductionTarget, phrase: string, backupConfirmed: string) {
  if (phrase !== approvalPhrase(target)) throw new Error("Explicit target approval was not supplied.");
  if (["migrate", "initialize", "admin"].includes(target.operation) && backupConfirmed !== "BACKUP VERIFIED") {
    throw new Error("Verify a recoverable backup before production writes.");
  }
}
