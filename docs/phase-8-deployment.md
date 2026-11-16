# Phase 8 — $0 deployment preparation

Stage B was committed as `c8a3de3e7fca97f10e389d96f4315e4a0650220a`.
Stage C has provisioned the approved free infrastructure; see the
[actual configuration and evidence](phase-8-infrastructure.md). No application
migration, initialization, account or deployment has been executed. Production
writes and deployment still require Stage D approval. `www.liminalflagstaff.org`
and historical images remain untouched. The intermittent RSC issue is unresolved.

## Architecture, limits and cost

Use Vercel **Hobby** for the existing Next.js application (static public routes,
Node administration/API routes/Server Actions), and Neon **Free**, PostgreSQL
**17**, for a fresh `liminal_production` database containing synthetic data only.
Keep Better Auth; do not enable provider auth or a Data API. Use a stable generated
`.vercel.app` HTTPS origin. No custom domain, production containers, separate
backend, Redis, queues, paid storage, trials, cards or billing activation.

`vercel.json` selects `iad1`; choose a nearby Neon AWS region during approved
provisioning, or review a region change first. Strict recurring budget: **$0**.
When quotas are exhausted, accept interruptions, reduce consumption or wait; do
not upgrade or evade quotas. Avoid artificial database keep-alives or constant
admin health probes.

Provider documentation checked November 15, 2026:

- [Neon pricing](https://neon.com/pricing): Free includes 100 CU-hours/month/project,
  1 GB database storage, 5 GB public egress, five-minute idle suspension, up to six
  hours OR 1 GB of recovery history, and one snapshot. The shorter recovery bound
  wins. No paid scheduled backups/seven-day history are assumed. Recovery branches
  consume quota too. Confirm the selected project's dashboard limits in Stage C.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): personal/noncommercial use,
  100 GB transfer, one million invocations, four CPU-hours, 360 GB-hours memory,
  and one hour runtime-log retention. Quotas can interrupt service. This is a
  personal portfolio/archive, not a commercial operations service.
- [WAF rate limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting):
  Hobby includes one rate rule within three custom rules, one million allowed
  requests, IP/JA4 keys, fixed windows between 10 seconds and 10 minutes. Counters
  are **per region**, not an exact global login-attempt budget. The general pricing
  table also lists paid metering; do not activate billing.
- [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions):
  select **24.x**, matching package engines. Vercel controls minor/patch updates;
  build/function versions may differ. Local checks retain **24.22.2**.

## Build and environment

`vercel.json` runs `npm ci --include=dev`, then `npm run build`. The committed
lockfile is authoritative; postinstall generates the ignored Prisma client.
Prisma CLI, TypeScript and build tooling must exist at build time. Keep webpack.
Do not run migrations in install/build/startup/requests or preview builds. Vercel
packages the Next.js functions; no static export or separate server is required.

Configure through provider environment/secret facilities, never source or command
arguments:

| Variable | Production purpose |
| --- | --- |
| `NODE_ENV` | Vercel supplies `production`; operator CLI explicitly requires it |
| `DATABASE_URL` | Neon pooled URL, restricted `liminal_runtime`, database `liminal_production`, `sslmode=verify-full` |
| `BETTER_AUTH_URL` | Exact stable `https://<project>.vercel.app` origin, no path/query |
| `BETTER_AUTH_SECRET` | Independent random secret, at least 32 characters; stable across releases |
| `TEMPORARY_SITE_NOINDEX` | `true`; also defaults to noindex on Vercel when absent |
| `VERCEL` | Provider-supplied `1`; do not set for local operator commands |

No local/test secrets, `.env` uploads, or `NEXT_PUBLIC_*` secrets. No migration,
operator or backup credentials on Vercel. Previews receive **no production
secrets**. Public pages/builds remain lazy and can work without a database.
Authenticated staging requires a separately approved disposable Free database or
branch, independent auth configuration and private role-test accounts.

All temporary Vercel paths receive `X-Robots-Tag: noindex, nofollow`, including
Production deployments. Before eventual public launch, set
`TEMPORARY_SITE_NOINDEX=false`, **rebuild/redeploy**, and inspect responses. Admin
metadata continues to disallow indexing. Noindex is not access control.

## Pool lifecycle and transactions

The existing lazy per-process singleton is preserved. The adapter's `pg.Pool` now
has **max 3**, a five-second idle timeout and five-second connection/acquisition
timeout. Prisma owns external-pool disposal, so existing CLI/test `$disconnect()`
closes it. On Vercel only, pinned `@vercel/functions` registers suspension cleanup
with `attachDatabasePool`. This dependency provides lifecycle hygiene; it is not
needed for throughput and invokes no lifecycle hook in local tooling.

Use the included [Neon transaction pooler](https://neon.com/docs/connect/connection-pooling)
for runtime and direct connections for migration/operator/backup procedures.
Transactions retain their backend connection, preserving row locks, transaction
advisory locks and dashboard RepeatableRead/READ ONLY semantics. Avoid session
state with the pooler. No scheduling/auth policy, transaction isolation, mutation
retry or timeout policy changed. Test cold starts and contention before tuning.
Vercel Fluid Hobby allows 300-second requests; normal DB transactions must remain
short. Pooler queues are not additional database execution capacity.

## Database roles and remaining grants

Enable MFA on provider accounts before configuring production credentials.
Review actual project/branch/endpoint IDs, region, PostgreSQL version, Free/Hobby
plan badges, canonical URL and secret scopes with the owner. Match endpoint
hostname to the selected production branch in Neon and record that mapping
without credentials. A typed hostname alone does not establish provider identity.

Through a private direct TLS operator session:

1. Create `liminal_production`, not the default `neondb`; never copy development.
2. Create separate LOGIN roles `liminal_migrator`, `liminal_runtime`,
   `liminal_operator`, `liminal_backup`. No superuser, role/database creation or
   bypass-RLS privileges. Set credentials privately, e.g. psql `\password role`,
   never SQL password literals or shell history.
3. Make migrator owner of application database/public schema. Revoke PUBLIC
   schema CREATE and unnecessary PUBLIC database privileges. Other roles receive
   CONNECT/schema USAGE, without owner/migrator role membership.
4. After approved migrations, grant runtime/operator SELECT, INSERT, UPDATE,
   DELETE on the **12 application tables only**, and backup SELECT on those plus
   `_prisma_migrations`. Operator additionally needs SELECT on migration metadata
   for checksum verification. Runtime needs no migration-table access. No serial
   sequences currently exist (UUID identities). Explicitly review grants after
   future migrations; do not grant provider administrator membership.
5. Verify runtime cannot CREATE/ALTER tables or become migrator. Review future
   default privileges or include explicit grants with each release.

The database, four roles and ownership have now been verified in Stage C. The
post-migration table grants in step 4 remain a Stage D operation. See the
[infrastructure record](phase-8-infrastructure.md) for actual identities and
provider-specific ownership setup. Never use the provider owner as runtime identity.

## Guarded production operator CLI

Run from the reviewed repository using Node 24.22.2 and installed tooling:

```sh
NODE_ENV=production P8_PRODUCTION_HOST=<approved-direct-endpoint-hostname> npm run production:operator -- status
```

Operations: `status`, `migrate`, `initialize`, `admin`, `backup`. The hostname is
not a secret. **Never put the connection URL or passwords in command arguments.**
Hidden terminal input has history disabled so later prompts cannot recall secrets.
The CLI does not import dotenv and refuses non-TTY execution, extra arguments,
debug logging, nonproduction mode, local/custom/pooled hosts and wrong roles or
DB names. It reads URLs privately, permits only the exact direct endpoint, port
5432, expected role, `liminal_production`, mandatory `sslmode=verify-full` and
optional `channel_binding=require` only. Duplicate parameters, URL overrides and
TLS weakening are rejected.

Each invocation requires an exact operation/host/database/role approval phrase.
Writes require `BACKUP VERIFIED`: the operator must actually verify the external
recovery point. Attestation is not automatic backup QA. It checks live DB/user,
PostgreSQL 17, primary status and the actual native TLS socket with verified
certificate chain and endpoint hostname, and takes a nonblocking session
advisory lock to serialize operator commands. Generic errors suppress raw library
and child-tool output. No reset, automatic retry or migration resolution exists.

`status` and `migrate` use `liminal_migrator` and Prisma `migrate status` or
**`migrate deploy`** only, through `prisma.production.config.ts` (no dotenv or
local URL fallback). Pending/failed status exits generically; inspect details
privately. A failed/timed-out command can leave committed work: stop and inspect
migration/schema state before any corrective write. Preserve both committed SQL
migrations unchanged, including ambiguous recurrence rejection.

`initialize` uses `liminal_operator`, verifies both committed migration names and
SHA-256 checksums, and requires an explicit Phoenix start date (tomorrow through
seven days ahead) plus a second manifest confirmation:

- Eight explicitly synthetic volunteers, seven active, `@example.invalid` emails.
- Two roles/types, weekly availability, one two-occurrence recurring pattern.
- Four upcoming shifts, four assignments, mixed full/partial/empty coverage.
- No accounts, sessions, historical operational data or credentials.

All operational tables are locked and checked empty in the same transaction.
Existing data or a second initialization refuses safely; no refresh/reset mode.
Approve dates/counts again at Stage D.

`admin` uses `liminal_operator`, migration checksum validation, hidden password
and auth-secret prompts, and production HTTPS-origin validation. It reuses the
existing operator-only credential implementation: serialized transaction,
existing ADMIN/email refusal, official Better Auth signup/hash/link API on a
**private unmounted instance**, automatic signin disabled, transactional ADMIN
promotion. No session issued and no public signup enabled. Existing local-only
CLIs/guards remain unchanged.

Lost-password recovery requires a separate reviewed operator procedure: establish
owner identity/target, backup, supported Better Auth hashing/update mechanism,
revoke affected sessions and verify old password/session fail and new login
works. No executable account-recovery command is supplied; never use bootstrap to
overwrite an existing account.

## Manual backups and isolated restoration

Install PostgreSQL **17** client tools privately. Use `production:operator --
backup`, the direct TLS endpoint and `liminal_backup`. Connection credentials go
only in the child environment, never arguments/logs. The CLI requires pg_dump 17
and sets `PGSSLROOTCERT=system` with `PGSSLMODE=verify-full`, preserving
`PGCHANNELBINDING=require` when present in the URL; the installed client
must have a working system CA store. See [PostgreSQL TLS trust](https://www.postgresql.org/docs/17/libpq-connect.html).
Do not disable verification if trust setup fails.

Prepare an existing **encrypted** mounted destination outside the repository and
public/synced folders, with a private owner-only `0700` directory. Keep encryption
recovery keys separately. The CLI resolves symlinks, rejects repository paths,
checks owner/permissions, requires `ENCRYPTED STORAGE VERIFIED`, then exclusively
creates a `0600` custom-format dump, omitting ownership/ACL SQL. Tool stderr is
suppressed and failed archives removed. Encryption is an **operator check**: the
CLI cannot prove a filesystem is encrypted. Never stage plaintext archives on an
unencrypted volume. Backups include auth hashes and session tokens.

Back up before migrations/bulk changes, after meaningful admin changes, and at
least weekly during active use. Retain four weekly copies and a pre-release copy
until release verification; keep another encrypted copy on existing private
storage where available. No purchased storage or scheduled backup service.
Check successful exit, archive readability (`pg_restore --list` privately) and
isolated restore before calling a backup verified. Never share raw dumps/rows.
See [Neon pg_dump guidance](https://neon.com/docs/manage/backup-pg-dump).

Restore rehearsal:

1. Start a uniquely named disposable PostgreSQL **17** container using the pinned
   image in `compose.yaml`, **network disabled, no published ports**, database/user
   `liminal_recovery`, and separate tmpfs/disposable volume. Never use existing
   development/test DBs as restore destinations. This is local QA, not hosting.
2. Query and verify destination database/user both `liminal_recovery`, version 17,
   and empty schema before any restore. Stream the selected archive from encrypted
   storage into `pg_restore --exit-on-error --no-owner --no-acl` in that container.
   No `--clean`, live overwrite or target tunneling.
3. Remove restored Session rows only in the verified isolated destination before
   allowing app access. Keep its network disabled. Verify migration names and
   checksums, constraints/triggers/FKs, immutable occurrence identity, counts and
   staffing. Record sanitized results and elapsed time.
4. An application-level recovery rehearsal additionally requires isolated local
   app config, fresh nonproduction auth secret/origin and private credential
   handling. Record whether login/dashboard were actually tested. Never reuse a
   production secret. Remove only the owned recovery container/volume afterward.

Manual recovery loses changes since the last successful backup; no guaranteed
24-hour recovery point or restore-time SLA. Record backup age and measured time.
Neon Free short history/one snapshot is supplementary. A local logical restore
does not prove Neon restoration; temporary Free provider recovery resources need
separate approval and available quota. Live failed-migration correction/recovery
requires explicit target/downtime approval. Git rollback does not reverse schema;
old application artifacts must be compatible with the current DB.

## Ingress and deployment verification

Stage C: configure the free WAF rule for POST and exact path
`/api/auth/sign-in/email`, IP key, five requests/60 seconds, action **429**, not
log-only. Cover every deployment hostname; inspect bypass rules. Verify the actual
pricing/plan UI and refuse billing activation. If the documented free rule is
unavailable, stop for review: a free owner-IP restriction of the login endpoint is
the simplest temporary alternative, reducing roaming access. No automatic paid
upgrade or silent fallback to only the per-process memory limiter.

Retain the memory limiter. WAF counters are regional and fixed-window boundaries
allow bursts. Test effective throttling, reset and spoofed forwarded-header
rejection through actual ingress; see [Vercel headers](https://vercel.com/docs/headers/request-headers).
No globally exact attempt limit or availability guarantee is claimed.

Before release run unit/integration suites, lint, TypeScript, isolated production
build, migration status and record reviewed commit. Never test against production.
Verify deployed Node build/function versions and Prisma bundling. Public-route
success and a local build do not establish hosted compatibility.

On HTTPS verify TLS/cookies, canonical trusted origin/CSRF, hostile-origin rejection,
signup denial, private ADMIN/COORDINATOR/VIEWER permissions in isolated staging,
logout invalidation, disabled users, noindex and sanitized logs. Initial production
retains only the owner's account. Capture diagnostic references promptly (Hobby
logs: one hour); keep sanitized private incident notes seven days or until the
incident is resolved. Never export raw HAR/auth requests.

Test volunteer creation/editing, shift creation/editing, recurring materialization,
assignments/cancellations, capacity changes, stale/validation errors and warm/cold
post-save navigation. For RSC failure retain sanitized method/path/status/timing,
browser stack, build version and diagnostic IDs; independently inspect committed
state before retrying. Stop for material failures. No mutation retries, suppression
or claim that passing smoke tests resolve the intermittent issue.

Test outage/reconnection only in staging and restore only in isolation. Verify no
historical records entered production. Separate observed results from procedures
in `phase-8-readiness.md`.

## Approval sequence

1. Completed: review Stage B, commit it, and explicitly approve Stage C.
2. Stage C creates only Hobby/Free resources and separate database/roles; configures
   secret scopes, canonical URL, free firewall and backup destination; verifies
   actual target/permissions. No application migration, seed, account or deployment.
3. Present sanitized target mapping, reviewed commit/migration checksums, backup
   and restore evidence, fixture manifest and bootstrap method for explicit Stage D
   write/deployment approval. Even a fresh empty DB gets a pre-migration backup.
4. Stage D: approved migrations, post-migration grants, initialization, bootstrap,
   deployment, HTTPS workflows, recovery checks. Recheck target before each write.
5. Stage E after essential checks: record URL, commit/migration state, recovery
   evidence, quotas and remaining limitations. Future historical content/images
   change through ordinary commits/deployments without database reconstruction.
