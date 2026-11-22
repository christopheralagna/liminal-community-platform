# Phase 8 Stage D — final execution checklist

Prepared November 16, 2026, America/Phoenix. **Owner execution authorization
received November 16, 2026**, for the documented target, migration hashes, backup
gate, permissions matrix, November 17 manifest, private administrator bootstrap,
first deployment and verification. Stage C is approved complete, including
owner-confirmed independent encrypted-backup unlock. Authorization remains
conditional on every documented safeguard. Migrations, approved grants and
synthetic initialization have now completed; administrator entry is pending.
See the [execution record](phase-8-stage-d-execution.md) for observed results.

## 1. Release and exact targets

Reviewed application source: `e3f497222b9179517ddfbe4789cf2db3cc5b702d`
(Stage C). Preparation changes after that commit are documentation only and remain
uncommitted. Before executing, record the final reviewed release commit/snapshot;
stop if application code, migrations or target settings differ from this checklist.

| Target | Exact approved identity |
| --- | --- |
| Neon organization / plan | `org-patient-fire-50453705`, Free |
| Neon project | `noisy-block-56992135` / `liminal-portfolio` |
| Production branch | `br-late-sunset-bc0auh1a` / `production` |
| Database / major version | `liminal_production` / PostgreSQL 17 |
| Direct endpoint | `ep-cold-violet-bc14pcl7.c-16.us-east-1.aws.neon.tech` |
| Migration identity | `liminal_migrator` |
| Initialization/admin identity | `liminal_operator` |
| Backup identity | `liminal_backup` |
| Runtime identity | `liminal_runtime`, pooled endpoint only |
| Vercel account / plan | `hello-joy-wolf`, Hobby |
| Vercel project | `liminal-portfolio` / `prj_Ymd5k6NoGiGTiF7OX6wraMuQxDBY` |
| Regions / runtime | Neon AWS us-east-1; Vercel iad1; Node 24.x |
| Canonical HTTPS origin | `https://liminal-portfolio.vercel.app` |

A fresh read-only check on November 16 confirmed the exact live database and
migrator identity, PostgreSQL **17.12**, primary status, native TLS 1.3 with
certificate/hostname verification, migrator database/schema ownership, and
**zero public/application tables**. All four application/operator roles remain
without superuser, CREATEDB, CREATEROLE, replication or BYPASSRLS privileges.
Provider project/branch mapping and Free/Hobby plan evidence are in the
[Stage C record](phase-8-infrastructure.md); recheck plans, mapping, zero deployments
and production-only environment scopes immediately before approved execution.

**Budget stays $0/month.** No trial, billing activation, paid capability, new
service, custom domain, Git auto-deployment, historical-image change or modification
to `www.liminalflagstaff.org` is authorized.

## 2. Exact migration files and checksums

Local SHA-256 checks matched HEAD and the Stage B versions byte-for-byte:

| Order | Migration | SHA-256 |
| --- | --- | --- |
| 1 | `20261108000000_initial` | `3825bf02d5cc65dcbf437d0f9b28b91344a8311c34d595293478aaafced7bbb0` |
| 2 | `20261110000000_shift_occurrence_date` | `5f6dc64f39d2af91d1d6984fdd0d880f826b6e6fdb406044fa5dd1ac79bc714e` |

Use the existing guarded `production:operator -- migrate`, which invokes only
`prisma migrate deploy --config prisma.production.config.ts`. No migration file
editing, db push, migrate dev, reset, resolve, new migration or seed is included.
The second migration retains its ambiguous-recurring-row refusal and immutable
occurrence identity trigger. With a verified empty target no historical recurrence
inference is needed. Prior isolated PostgreSQL integration validation: 140 tests
passed. Stage C's 52 unit tests, typecheck/lint and isolated production build passed;
52 unit tests and typecheck were rerun before the Stage C commit.

After migration, require exactly those two successfully completed migration names
and checksums, 12 application tables plus `_prisma_migrations`, expected constraints,
foreign keys, indexes and occurrence trigger. Stop on drift or failure; inspect
privately before any retry. Git rollback does not roll back database schema.

## 3. Backup gate before the first production write

Existing verified pre-migration backup:

- Encrypted image: `/Users/christopheralagna/LiminalBackups.dmg`, APFS/AES-256.
- Private mounted directory: `/Volumes/LiminalBackups/private`, owner-only 0700;
  image/archive/secrets files 0600, filesystem ownership enforcement verified.
- Archive: `liminal-2026-11-16T08-01-30.102Z.dump`, **1,161 bytes**;
  created November 16 at **01:01:30 Phoenix / 08:01:30 UTC**.
- SHA-256: `d24e62d16f90b96629a28499b3981289020a48091b86650d1818e873520116b9`.
- pg_dump/pg_restore **17.12**; restricted backup role, direct verified TLS,
  system CA trust and required channel binding. No credentials in argv/logs.
- Archive catalog and isolated empty PostgreSQL 17 restore passed in Stage C,
  network disabled, no published ports, separate disposable tmpfs. Owned recovery
  container was removed; development/test storage was retained.
- Owner confirmed independent password unlock on November 16. This supersedes
  the earlier skipped/unverified password check.

**Current preparation observation:** the encrypted volume is ejected, so the
archive was not re-read during this preparation. This is not a failed archive
check. Before any production write, privately unlock/remount it, recheck ownership,
0700/0600 modes, hash and catalog, and confirm the source DB is still empty and
unchanged since the dump. Verify recoverability before typing `BACKUP VERIFIED`.
If the source changed, stop and take/verify a fresh guarded backup first; existing
empty backup evidence cannot cover changed data. Do not skip this gate.

No scheduled paid backups or seven-day recovery are assumed. Neon Free short
history is supplementary. Take and test a new populated backup after initialization
and bootstrap; the empty restoration does not prove application recovery.

## 4. Post-migration permissions — proposed writes requiring approval

After validating migration results, use the verified migrator direct connection
for explicit grants on these exact application tables:

`User`, `Account`, `Session`, `Verification`, `VolunteerProfile`, `VolunteerRole`,
`VolunteerRoleMembership`, `Availability`, `ShiftDefinition`, `ShiftPattern`,
`Shift`, `ShiftAssignment`.

- Runtime/operator: SELECT, INSERT, UPDATE, DELETE on the above tables only.
- Backup: SELECT on the above tables and `_prisma_migrations`.
- Operator: additional SELECT on `_prisma_migrations` for initialization/bootstrap
  checksum verification. Runtime receives no migration-table access.
- Retain existing CONNECT/schema USAGE, UUID identities, restricted role attributes,
  PUBLIC revocations and migrator ownership. No TRUNCATE, schema CREATE, ownership,
  provider-admin membership or blanket future/default grants to the other roles.

Verify the privilege matrix with catalog/privilege queries and fresh role sessions.
Verify direct operator and pooled runtime identity/TLS, transaction queries and
runtime denial of migration-table access. No destructive DDL probe in production.
No permissions should be broadened to bypass a migration/bootstrap failure.

## 5. Synthetic initialization — proposed manifest and dates

**Proposed start: Tuesday, November 17, 2026, America/Phoenix (UTC−07:00).**
The owner must approve this date/manifest with execution authorization. The guarded
CLI only accepts tomorrow through seven days ahead; if execution is delayed past
that window, stop and obtain approval for replacement dates.

| Date (Phoenix) | Local time | Type | Capacity / assigned |
| --- | --- | --- | --- |
| Tue Nov 17, 2026 | 09:00–11:00 | Synthetic Demo Cafe Morning, recurring | 2 / 2 |
| Wed Nov 18, 2026 | 14:00–16:00 | Synthetic Demo Setup Afternoon, one-time | 2 / 1 |
| Fri Nov 20, 2026 | 14:00–16:00 | Synthetic Demo Setup Afternoon, one-time | 2 / 0 |
| Tue Nov 24, 2026 | 09:00–11:00 | Synthetic Demo Cafe Morning, recurring | 2 / 1 |

Manifest: **eight** synthetic volunteers (seven active, one inactive), display
names `Synthetic Demo Volunteer 1` through `8`, `@example.invalid` emails;
**two** roles, **two** shift types, **eight** role memberships, **56** availability
rows (08:00–18:00 on each weekday per volunteer, valid November 17–December 15),
**one** weekly two-occurrence pattern, **four** shifts, **four** assignments.
No historical records, user accounts or sessions are created by initialization.

Use guarded `production:operator -- initialize` as `liminal_operator`, with exact
operation/host/database/role approval phrase, backup attestation, migration
checksums, explicit start date and `INITIALIZE SYNTHETIC DATA` confirmation.
Initialization locks/checks every operational table and commits atomically only
when empty. Existing data causes refusal; no upsert, reset, refresh or repeat seed.

## 6. Private initial administrator — procedure requiring approval

Use guarded `production:operator -- admin` as `liminal_operator`, after backup and
migration/checksum checks. Supply the owner's chosen name/email privately at the
operator prompt. Enter and confirm a **12–128 character password** through hidden
terminal input; enter the existing production Better Auth secret privately too.
Do not paste credentials in chat, shell arguments, documentation or environment
files in the repository. Canonical `BETTER_AUTH_URL` is the exact origin above.

The existing bootstrap serializes provisioning, refuses any existing ADMIN or
matching email, invokes official Better Auth signup/hash/credential-linking on a
private unmounted instance with automatic signin disabled, then promotes the user
to ADMIN within the same transaction. It issues no session, overwrites no account,
and enables no public signup. Create only the owner's account. No production
VIEWER/COORDINATOR test users are included. Role-flow tests use isolated staging.

Administrator name/email/password have **not** been selected or collected in this
preparation. The owner must supply them privately at the bootstrap step, after
explicit authorization; never choose or provision placeholder credentials.

## 7. First production deployment and verification — approval required

After the preceding checks, deploy the reviewed source snapshot using the existing
linked project and authenticated Vercel CLI, explicitly selecting production and
scope `hello-joy-wolf`. No deployment command has run in this preparation. No
preview may receive production secrets. Retain only production-scoped runtime
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and
`TEMPORARY_SITE_NOINDEX=true`; no operator/migration/backup credentials on Vercel.
Verify uploaded source excludes `.env*`, provider credential metadata, backups,
references and local build artifacts. Retain Node 24.x, iad1, bounded pool and
Prisma generation during installation/build. No migrations in build/startup.

After deployment, verify and record:

- Actual build/function runtime and Prisma bundling; temporary canonical HTTPS,
  certificate and secure cookies; `X-Robots-Tag: noindex, nofollow` on public,
  admin and auth paths. Noindex remains reversible only by deliberate rebuild.
- Successful owner login, trusted-origin/CSRF and hostile-origin rejection,
  signup denial, logout invalidation and disabled-user behavior; role enforcement
  using approved isolated test identities rather than extra production accounts.
- Active free WAF POST `/api/auth/sign-in/email` rule, five requests/IP/60 seconds,
  above-limit 429, reset and spoofed-forwarded-header behavior. Counters are
  regional and fixed-window; retain the existing process limiter.
- Public routes plus authenticated volunteer/scheduling/assignment flows and
  warm/cold post-save navigation. Record any intentional test mutations and verify
  resulting state; do not retry blindly. No historical data enters production.
- **RSC reliability remains unresolved.** Capture sanitized route/status/timing,
  stack and diagnostic IDs for stream/navigation failures; independently inspect
  committed DB state before retry. Material failures stop progression.
- New populated encrypted backup, isolated PostgreSQL 17 restoration and schema,
  checksum/constraint/trigger/count verification; isolated app testing uses fresh
  nonproduction secret/origin and invalidates restored sessions before access.
  No live destructive restoration, automatic rollback or provider recovery branch
  is authorized by this checklist. Staging-only outage/reconnection testing remains
  outstanding until an isolated target is available/approved.

## Execution gate

**Execution authorization received** for the above exact target, migration
hashes, backup gate, post-migration grants, November 17 synthetic manifest, private
administrator procedure and first production deployment. Initial read-only
provider checks reconfirmed Free/Hobby, the project/branch identities, Virginia
regions, Node 24.x and zero deployments. Phoenix date is November 16, so the
approved November 17 start remains valid.

**Current hold: private administrator entry.** The owner remounted the backup;
encryption, ownership, modes, archive checksum/catalog and the live empty target
passed. Both migrations, schema verification, approved grants and synthetic
initialization succeeded. Verified fixture counts/dates match the approved
manifest, with zero users/accounts/sessions. The owner has been asked to run the
private terminal bootstrap. Do not repeat completed mutations. Deployment and
populated backup/restoration remain pending. Stop on unexpected failure; do not
weaken TLS, target checks, role restrictions or backup requirements.
