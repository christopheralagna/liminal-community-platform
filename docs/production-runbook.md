# Production operations — Phase 8 prerequisites

Phase 8 Stage B supplies a concrete [$0 hosting procedure](phase-8-deployment.md)
and guarded operator CLI. This runbook remains the safety baseline; it does not
authorize provisioning or production writes. See [local evidence](phase-8-readiness.md).

Free infrastructure is provisioned; the application is not deployed. The
[Stage C record](phase-8-infrastructure.md) distinguishes observed provider state
from remaining Stage D operations. Keep the public historical archive separate
from synthetic administrative records. Historical image review remains deferred.

## Configuration and release preparation

- Use the pinned Node 24 runtime and lockfile (`npm ci`). Build with development
  tooling installed: installation generates Prisma, and the build needs TypeScript
  and other build tools. Verify the final deployment artifact starts independently.
- Set `NODE_ENV=production`, an explicit canonical HTTPS `BETTER_AUTH_URL`, an
  independently generated `BETTER_AUTH_SECRET` of at least 32 random characters,
  and `DATABASE_URL` through the host's secret store. Never put secrets in build
  logs, command arguments, source, screenshots, or `NEXT_PUBLIC_*` variables.
- Production must have its own database, credentials, and backups. Do not copy
  the development database or reuse `TEST_DATABASE_URL`. Validate the provider's
  TLS certificate requirements; never disable verification to make it connect.
- Give the application only necessary runtime privileges. Use a separate,
  controlled migration identity. Size connection pools against the provider's
  connection budget and maximum application instances; the client is shared per
  process, not across instances.
- Terminate HTTPS at a trusted ingress, overwrite the configured forwarded-IP
  header, and prevent direct access to the backend. Verify origin/host forwarding,
  cookies, and login throttling through that ingress. The in-memory limiter is
  per process and resets on restart; decide whether the chosen exposure/topology
  needs additional host-provided limits. No shared limiter is currently installed.
- Run unit/integration tests, lint, TypeScript, and a fresh production build before
  release. Keep a known-good immutable application artifact and record its commit
  and migration state. Never build into an actively running development `.next`.

## Migrations and initial access

1. Obtain an explicit production target approval and maintenance plan. Record the
   expected host/database/user identity without credentials. Verify the actual
   live identity independently immediately before any write.
2. Take a recoverable backup and verify its availability. Check migration status
   and review the committed SQL. Apply migrations once from a controlled release
   job using Prisma `migrate deploy`, never `migrate dev`, `db push`, or reset.
3. Preserve applied migrations. The occurrence-identity migration deliberately
   refuses ambiguous preexisting recurring shifts; investigate such a refusal
   rather than inferring dates or removing its checks.
4. Phase 8 must supply a reviewed, separately guarded initial-admin procedure.
   It must verify the live production identity, accept secrets privately, use
   Better Auth's supported credential API, serialize bootstrap attempts, refuse
   an existing administrator/email, and issue no session. Do not expose signup
   or provisioning over HTTP, seed credentials, or weaken the local CLI guards.
5. Verify login, current permissions, logout invalidation, and disabled-account
   behavior. Give write access only to intended reviewers. Public/shared demo
   credentials must not carry ADMIN permissions.

Existing `db:migrate`, `db:seed`, and provisioning CLIs are intentionally local
only. Do not bypass them by changing `NODE_ENV`, tunneling production into a
local approved identity, or copying production into development. Production
commands are not implemented by Phase 7.

## Credential recovery

Password loss currently has no public recovery workflow. Phase 8 must define an
operator-only procedure: verify the owner's identity and database target, back up,
use Better Auth's supported password hashing/update workflow, revoke the affected
user's sessions, and confirm the old password/session fails and the new login
works. Never write plaintext passwords, hand-roll hashes, enable public signup,
or use the initial-bootstrap procedure to overwrite an existing account. Keep
the production secret stable across normal releases; plan intentional secret
rotation and session invalidation separately. Do not store recovery secrets here.

## Backup and isolated restoration

Choose managed backups or a scheduled PostgreSQL backup process appropriate to
the host. Define retention, backup access, encryption, acceptable data loss, and
restore time before launch. Database backups contain credential hashes and
session tokens even when volunteer records are synthetic; treat them as secrets.

Rehearse a restore into a **new isolated database**, using compatible PostgreSQL
tools. Verify the destination identity before restoring and never restore over
the live database as a test. Prevent public access and outbound side effects;
invalidate restored sessions before allowing test access. Check migration state,
constraints, recurrence identity, relationships, staffing, and application reads.
Record the tested backup and elapsed restore time without personal records or
credentials. Provider snapshots alone are not evidence of a tested restoration.

The seed creates missing fictional fixtures and preserves existing records. It
does not restore all records to an original state. A demo refresh must use a
reviewed synthetic-only snapshot or a separately approved disposable database
replacement, with account/session handling explicit. Never reset an existing
database or import historical volunteer records as a shortcut.

## Migration failure and rollback

Stop the release on migration failure. Preserve sanitized evidence and inspect
Prisma's migration status and actual schema before deciding what to do. Do not
blindly retry, mark a migration applied, edit applied SQL, or reset the database.
Determine whether SQL committed partially; rehearse the corrective forward
migration or backup restoration in isolation. Prisma migration-resolution tools
require a reviewed recovery decision and evidence that the schema matches it.

Application rollback is safe only if the old artifact supports the current
schema and data. Reverting Git does not reverse a database migration. Prefer a
compatible forward fix; if restoration is necessary, stop writes, choose the
approved recovery point, account for post-backup changes, restore under the
approved downtime plan, and verify before reopening access.

## Health checks and troubleshooting

- Check the six public routes, unauthenticated admin redirect, and login page.
  Public-page success does not establish database or authentication health.
- With an authorized synthetic account, check dashboard/volunteer/schedule reads
  and one controlled create/edit workflow. Verify saved state independently.
- Check HTTPS cookies, rejected hostile origins, VIEWER mutation denial, logout
  replay, and login limits at the public ingress. Never include cookies in logs.
- Preserve server timestamps and the displayed diagnostic reference for an
  unexpected failure. Logs should contain only allowlisted event/classification
  fields; do not enable raw Prisma/Better Auth debug logs in production.
- For an RSC response failure, inspect the record before retrying. Capture the
  workflow, build/version, sanitized request method/path/status sequence, browser
  stack, and correlated server event. Do not export unsanitized HAR files, which
  may contain passwords, cookies, and form bodies. No automatic mutation retry.
- Set an operator review/retention procedure for runtime logs and expired-session
  cleanup. Verify database reconnection after a controlled outage in staging.

Before launch, complete the focused development-versus-production RSC verification
record in `phase-7-readiness.md`. An intermittent error that was not observed in a
smoke check must not be described as conclusively fixed.
