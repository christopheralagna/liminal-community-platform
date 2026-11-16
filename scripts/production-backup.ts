import { realpath, stat, open, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";

export function isOutsideRepository(directory: string, repository: string) {
  const path = relative(repository, directory);
  return path === ".." || path.startsWith(`..${sep}`);
}

// The operator must separately verify encryption of the mounted destination.
export async function writeProductionBackup(url: string, directory: string, encryptedConfirmation: string) {
  if (encryptedConfirmation !== "ENCRYPTED STORAGE VERIFIED" || !isAbsolute(directory)) throw new Error("Confirm an encrypted absolute backup directory.");
  const destination = await realpath(directory);
  if (!isOutsideRepository(destination, await realpath(process.cwd()))) throw new Error("Backups must be outside the repository.");
  const info = await stat(destination);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) throw new Error("Backup directory must be owner-only (0700).");
  const version = spawnSync("pg_dump", ["--version"], { encoding: "utf8", env: { NODE_ENV: "production", PATH: process.env.PATH } });
  if (version.status !== 0 || !/^pg_dump \(PostgreSQL\) 17\./.test(version.stdout)) throw new Error("PostgreSQL 17 pg_dump is required.");
  const file = resolve(destination, `liminal-${new Date().toISOString().replaceAll(":", "-")}.dump`);
  const handle = await open(file, "wx", 0o600);
  try {
    const connection = new URL(url);
    const result = await new Promise<number | null>((done, reject) => {
      const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--lock-wait-timeout=10s"], {
        env: { NODE_ENV: "production", PATH: process.env.PATH, PGHOST: connection.hostname, PGPORT: "5432", PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
          PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password),
          PGSSLMODE: "verify-full", PGSSLROOTCERT: "system", PGCONNECT_TIMEOUT: "10",
          PGCHANNELBINDING: connection.searchParams.get("channel_binding") === "require" ? "require" : "prefer" },
        stdio: ["ignore", handle.fd, "ignore"],
      });
      child.once("error", reject);
      child.once("exit", done);
    });
    if (result !== 0) throw new Error("Backup failed; no successful archive was retained.");
    await handle.sync();
    if ((await handle.stat()).size === 0) throw new Error("Empty backup.");
  } catch {
    await unlink(file);
    throw new Error("Backup failed; inspect tool availability and approved connection privately.");
  } finally { await handle.close(); }
  return file;
}
