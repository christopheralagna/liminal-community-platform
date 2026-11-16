import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions/db-connections";
import { PrismaClient } from "../../generated/prisma/client";

// Shared factory for server use and local tooling; no connection until first query.
export function createDatabaseClient(connectionString: string) {
  const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 5000, connectionTimeoutMillis: 5000 });
  // Local CLIs/tests own disposal. On Vercel, close idle sockets before suspension.
  if (process.env.VERCEL === "1") attachDatabasePool(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
}
