// No dotenv import: production targets and secrets must never fall back to .env.
import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDatabaseClient } from "../src/server/database/client";
import { provisionInitialAdmin } from "../src/server/auth/provision";
import { readAuthEnvironment } from "../src/server/auth/environment";
import { addDays, phoenixDate } from "../src/server/scheduling/dates";
import { approvalPhrase, assertApproval, assertProductionIdentity, productionTarget, validateProductionUrl } from "./production-target";
import { initializeProductionFixtures, fixtureDates } from "./production-fixtures";
import { operatorPrompt } from "./operator-prompt";
import { writeProductionBackup } from "./production-backup";

const migrations = ["20261108000000_initial", "20261110000000_shift_occurrence_date"];

async function main() {
  if (process.argv.length !== 3 || process.env.DEBUG || process.env.PRISMA_DEBUG) throw new Error("Use one operation, without debug logging.");
  const prompt = operatorPrompt(); // Refuse CI/non-TTY before reading secrets or connecting.
  let client: Client | undefined;
  let database: ReturnType<typeof createDatabaseClient> | undefined;
  try {
    const target = productionTarget(process.env, process.argv[2]);
    console.log(`Target: ${target.host}/${target.database} as ${target.role}. No production approval is implied by Stage B.`);
    const phrase = await prompt.ask(`Type ${approvalPhrase(target)}: `);
    const backup = ["migrate", "initialize", "admin"].includes(target.operation) ? await prompt.ask("After verifying an external recoverable backup, type BACKUP VERIFIED: ") : "";
    assertApproval(target, phrase, backup);
    const url = validateProductionUrl(await prompt.secret("Direct PostgreSQL URL (hidden): "), target);
    client = new Client({ connectionString: url, connectionTimeoutMillis: 10000 });
    client.on("error", () => { /* Never serialize pg's credential-bearing client/errors. Queries fail closed. */ });
    await client.connect();
    const identity = await client.query('SELECT current_database() AS database, current_user AS username, current_setting(\'server_version_num\')::int AS version, pg_is_in_recovery() AS recovery');
    assertProductionIdentity(target, identity.rows);
    const tls = await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
    if (tls.rows[0]?.ssl !== true) throw new Error("Verified TLS is required.");
    // One operator operation at a time; independent from the bootstrap xact lock.
    const lock = await client.query("SELECT pg_try_advisory_lock(7684202609::bigint) AS acquired");
    if (!lock.rows[0]?.acquired) throw new Error("Another production operator command is running.");
    if (target.operation === "backup") {
      const directory = await prompt.ask("Existing encrypted owner-only backup directory (absolute): ");
      const encrypted = await prompt.ask("Type ENCRYPTED STORAGE VERIFIED after checking destination encryption: ");
      await writeProductionBackup(url, directory, encrypted);
      console.log("Backup archive created in the approved directory. Restoration remains a separate verification.");
      return;
    }
    if (target.operation === "status" || target.operation === "migrate") {
      // Capture output: Prisma CLI may otherwise print connection metadata/raw errors.
      const result = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", target.operation === "migrate" ? "deploy" : "status", "--config", "prisma.production.config.ts"], {
        env: { PATH: process.env.PATH, NODE_ENV: "production", P8_PRODUCTION_HOST: target.host, DATABASE_URL: url, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
        encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024,
      });
      if (result.error || result.status !== 0) throw new Error("Migration command failed. Stop and inspect state privately; do not retry or reset.");
      console.log("Prisma migration command succeeded. Record reviewed commit and migration names separately.");
      return;
    }
    const applied = await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY migration_name');
    if (applied.rows.length !== migrations.length) throw new Error("Unexpected migration state.");
    for (const [i, name] of Array.from(migrations.entries())) {
      const checksum = createHash("sha256").update(await readFile(resolve("prisma/migrations", name, "migration.sql"))).digest("hex");
      if (applied.rows[i].migration_name !== name || !applied.rows[i].finished_at || applied.rows[i].checksum !== checksum) throw new Error("Migration identity/checksum mismatch.");
    }
    database = createDatabaseClient(url);
    if (target.operation === "initialize") {
      const start = await prompt.ask("Approved synthetic start date (YYYY-MM-DD, tomorrow through seven days ahead in Phoenix): ");
      fixtureDates(start);
      const today = phoenixDate();
      if (start <= today || start > addDays(today, 7)) throw new Error("Fixture start must be within the next seven days.");
      console.log(`Synthetic manifest: 8 volunteers, 2 roles, 2 types, 1 pattern, 4 shifts, 4 assignments; ${start} through ${addDays(start, 7)}. No accounts.`);
      if (await prompt.ask("Type INITIALIZE SYNTHETIC DATA to approve this manifest: ") !== "INITIALIZE SYNTHETIC DATA") throw new Error("Manifest not approved.");
      await database.$transaction(tx => initializeProductionFixtures(tx, start), { timeout: 30000 });
      console.log("Synthetic initialization committed. Existing records were not overwritten.");
    } else {
      const name = await prompt.ask("Administrator name: ");
      const email = await prompt.ask("Administrator email: ");
      const password = await prompt.secret("Password (12–128 characters, hidden): ");
      if (password !== await prompt.secret("Confirm password (hidden): ")) throw new Error("Password mismatch.");
      const authEnv = { NODE_ENV: "production", BETTER_AUTH_URL: process.env.BETTER_AUTH_URL, BETTER_AUTH_SECRET: await prompt.secret("Production Better Auth secret (hidden): ") };
      readAuthEnvironment(authEnv);
      await provisionInitialAdmin(database, authEnv, { name, email: email.trim().toLowerCase(), password });
      console.log("Initial administrator created. No session issued and no existing credentials replaced.");
    }
  } finally {
    prompt.close();
    try { await database?.$disconnect(); }
    finally { await client?.end(); }
  }
}
main().catch(() => {
  console.error("Production operator command stopped. Check approval, identity, backup, migration state and input privately. A write may have committed: inspect state before retrying. No reset or automatic retry was attempted.");
  process.exitCode = 1;
});
