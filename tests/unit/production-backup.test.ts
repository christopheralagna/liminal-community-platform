import { mkdtemp, chmod, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { writeProductionBackup } from "../../scripts/production-backup";

let directory: string | undefined;
afterEach(async () => { vi.unstubAllEnvs(); if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined; });
const url = "postgresql://liminal_backup:private-placeholder@ep-example.us-east-2.aws.neon.tech/liminal_production?sslmode=verify-full&channel_binding=require";
it("refuses unconfirmed, public and symlinked repository destinations before dumping", async () => {
  directory = await mkdtemp(join(tmpdir(), "liminal-backup-guard-"));
  await expect(writeProductionBackup(url, directory, "yes")).rejects.toThrow("encrypted");
  await chmod(directory, 0o755);
  await expect(writeProductionBackup(url, directory, "ENCRYPTED STORAGE VERIFIED")).rejects.toThrow("owner-only");
  const link = join(directory, "repository");
  await symlink(process.cwd(), link);
  await expect(writeProductionBackup(url, link, "ENCRYPTED STORAGE VERIFIED")).rejects.toThrow("outside");
});
it("removes incomplete archives and never passes credentials as tool arguments", async () => {
  directory = await mkdtemp(join(tmpdir(), "liminal-backup-child-"));
  await chmod(directory, 0o700);
  const bin = join(directory, "bin"), archives = join(directory, "archives");
  await mkdir(bin, { mode: 0o700 }); await mkdir(archives, { mode: 0o700 });
  const argumentsFile = join(directory, "arguments");
  const executable = join(bin, "pg_dump");
  // Fake executable never connects to a database; failed dump emits dummy bytes.
  await writeFile(executable, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "pg_dump (PostgreSQL) 17.9"; exit 0; fi\nprintf "%s\\n" "$@" > "$ARGUMENTS_FILE"\nprintf "incomplete archive"\nexit 1\n', { mode: 0o700 });
  // Child uses a minimal environment; record args at an explicit literal path instead.
  await writeFile(executable, (await readFile(executable, "utf8")).replace('"$ARGUMENTS_FILE"', `'${argumentsFile.replaceAll("'", "'\\''")}'`));
  await writeFile(executable, (await readFile(executable, "utf8")).replace('"$@"', '"$@" "sslrootcert=$PGSSLROOTCERT" "sslmode=$PGSSLMODE" "channelbinding=$PGCHANNELBINDING"'));
  vi.stubEnv("PATH", bin);
  await expect(writeProductionBackup(url, archives, "ENCRYPTED STORAGE VERIFIED")).rejects.toThrow("Backup failed");
  expect(await readdir(archives)).toEqual([]);
  const args = await readFile(argumentsFile, "utf8");
  expect(args).toContain("--format=custom");
  expect(args).toContain("sslrootcert=system"); expect(args).toContain("sslmode=verify-full"); expect(args).toContain("channelbinding=require");
  expect(args).not.toContain("private-placeholder"); expect(args).not.toContain("postgresql:");
  await writeFile(executable, (await readFile(executable, "utf8")).replace("exit 1", "exit 0"));
  const archive = await writeProductionBackup(url, archives, "ENCRYPTED STORAGE VERIFIED");
  expect((await stat(archive)).mode & 0o777).toBe(0o600);
  expect(await readFile(archive, "utf8")).toBe("incomplete archive"); // Dummy bytes only, no database connection.
});
