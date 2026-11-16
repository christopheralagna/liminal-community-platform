# Phase 8 Stage B — local preparation evidence

Historical Stage B evidence follows. Stage B is committed at `c8a3de3e`.
See the [Stage C infrastructure record](phase-8-infrastructure.md) for subsequent
provisioning, provider compatibility corrections and current remaining checks.

November 15, 2026. Starting repository: clean `main`, Phase 7 committed at
`fe1aeb29`. Stage B was explicitly approved for local implementation only. All
changes were initially delivered **uncommitted**, then reviewed and approved for
a single Stage B preparation commit. No Vercel/Neon resource, billing, production
connection, migration, seed, account or deployment was created/executed.

## Implemented

- Three-connection pg pool, five-second idle timeout and Vercel-only suspension
  cleanup through pinned `@vercel/functions@3.11.3` (db-connections subpath).
  Existing lazy client and Prisma disposal remain; local tools own no Vercel hook.
- Separate interactive production operator command for status/migrate/initialize/
  admin/backup. Hidden inputs with terminal history disabled, no dotenv/URL args,
  strict direct endpoint/database/role/TLS checks, live version/identity checks,
  operation-specific approval, backup attestation for writes, serialization and
  generic error output. Dedicated production Prisma config has no local fallback.
- Atomic empty-only synthetic initializer, reviewed relative date manifest,
  unchanged credential bootstrap mechanism with private supported Better Auth
  API, no public endpoint or session issuance. Local target guards unchanged.
- Owner-only external backup archive workflow with encryption attestation, direct
  verified TLS, PostgreSQL 17 client requirement and failed-archive removal.
- Default Vercel noindex with explicit reversible setting; Node/region/build
  settings and $0 architecture/operations documentation. No schema, migration,
  scheduling, volunteer or authentication-policy changes.

## Automated/local results

| Check | Observed result |
| --- | --- |
| Unit suite | **47 passed**, 14 files; baseline 33 plus 14 deployment cases |
| PostgreSQL integration suite | **140 passed**, eight files; baseline 139 plus initializer coverage |
| Focused backup test after final TLS/success assertions | **2 passed**; failed archive removed, successful mock archive 0600, secret absent from argv, system CA/verify-full enforced |
| ESLint, zero warnings | Passed |
| TypeScript, no emit/incremental disabled | Passed |
| Git whitespace check | Passed |
| Guarded local test migration status | Both committed migrations applied; up to date |
| Fresh isolated `npm ci --include=dev` | Passed; Prisma 7.10.1 generation completed |
| Isolated webpack production build, Node 24.22.2 | Passed; six public routes static, administration/API dynamic |
| Isolated production HTTP smoke | Six public routes/login 200; admin 307 to login; session lookup 200/no-store; unknown route 404 |
| Temporary noindex | All ten smoke responses carried `X-Robots-Tag: noindex, nofollow`; explicit opt-out also unit tested |
| Dependency audit | Seven moderate development-tool findings in the existing minimatch/typescript-eslint chain; no advisory reported against new helper |

The first integration attempt was blocked by sandbox loopback access; no tests ran
in that attempt. The approved escalated run used only the guarded local test
identity on port 5435 and passed. Docker Desktop was initially stopped; it was
started and the existing development/test containers were started without resets
or volume deletion. Tests never received a production connection.

An initial TypeScript pass found configuration typing/ES5 iterator issues in new
files; these were corrected before the passing validations. Full suites were not
repeated after unrelated documentation changes. The final backup assertion and
operator cleanup change received focused tests/lint/typecheck and a final isolated
build.

Builds used `/private/tmp/liminal-phase8-build-6ymnq9yk` with a copied source tree,
no local `.env`, and a fresh dependency install. **One mistaken additional rebuild
was launched from the repository root** while syncing the final copy. It finished
before interruption and rewrote ignored `.next` build output. A process check at
that point found no Next.js development server. This mistake is not evidence of
preserving the original build cache; source/database configuration was unchanged.
Final build and HTTP verification were repeated from the isolated copy. The owned
production smoke process was stopped afterward. No production credentials were
used; the smoke server used generated disposable auth configuration and an
unreachable dummy database, and did not exercise authenticated mutations.

## Isolated recovery rehearsal

A custom-format pg_dump from the **verified local test database** was streamed in
memory into a new empty PostgreSQL 17 container:

- Destination identity: database/user `liminal_recovery`; checked before restore.
- Same pinned image as Compose; network `none`, no published ports, separate tmpfs.
- Archive: 34,384 bytes; no dump file or credentials retained in artifacts.
- pg_restore `--exit-on-error --no-owner --no-acl`: succeeded.
- Both migration SHA-256 checksums: matched committed SQL.
- All 13 tables (12 application plus migration metadata): present.
- Recurrence immutability trigger: present; no invalid occurrence identities or
  orphan assignments found. RepeatableRead/READ ONLY queries succeeded.
- Restored sessions removed in the isolated destination before any app access.
- Streaming dump/restore/verification elapsed **1.03 seconds**, excluding container
  setup. This small test fixture result is not a production recovery-time promise.
- Only the owned recovery container/tmpfs was removed afterward; original
  development/test volumes were retained.

This verifies a local logical restoration of synthetic test data. It does **not**
verify a Neon source connection, production backup role grants, an encrypted
external archive destination/key recovery, provider restore, or application login
against the restored DB. Backup CLI refusal/cleanup/permissions are separately
covered using fake pg_dump executables that never connect to a database. The
manual production backup and recovery procedure remains subject to real target
approval and an actual recovery rehearsal before deployment completion.

## Still required after separate approvals

1. Stage C provisioning is now separately authorized for Vercel Hobby/Neon Free;
   it has not yet been performed. Verify plan badges/no
   card/trial, project/branch/endpoint mapping, nearby region, PostgreSQL 17,
   separate roles/privileges, secret scopes, stable `.vercel.app` origin and free
   firewall availability. No app migrations/data/account writes yet.
2. Owner encryption/storage choice and actual backup tools; test backup/recovery
   access and key recovery. Free six-hour/1-GB history is supplementary, not a
   seven-day backup strategy. Manual data loss is bounded only by backup age.
3. Explicit Stage D approval of actual target, reviewed commit/migration SQL and
   checksums, backup evidence, fixture dates/manifest, bootstrap and deployment.
4. Deployed Node patch versions, bundling, cold-start and database outage behavior;
   certificate/cookies/origin/CSRF, effective ingress throttle/spoof resistance,
   signup denial, role tests, logout and disabled-account checks on HTTPS.
5. Authenticated mutations and navigation through actual HTTPS for the known RSC
   errors. The issue remains **unresolved**; inspect committed state before retry,
   keep sanitized diagnostic IDs/evidence, and stop progression for material faults.
6. Production rollback/recovery and account recovery remain reviewed procedures,
   not tested production operations. No live URL, deployed commit or production
   migration state exists yet. Historical domain/images remain untouched.

Free firewall documentation confirms one Hobby fixed-window IP rule, but counters
are regional and actual ingress enforcement is not yet tested. If unavailable in
this account, seek review of a free owner-IP login restriction; no paid upgrade or
silent memory-only fallback. Free-tier quotas, suspension and short log retention
remain accepted limitations. See [operator instructions and checkpoints](phase-8-deployment.md).
