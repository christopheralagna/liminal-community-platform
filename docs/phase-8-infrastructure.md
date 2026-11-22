# Phase 8 Stage C — free infrastructure record

Verified November 16, 2026. Stage B commit:
`c8a3de3e7fca97f10e389d96f4315e4a0650220a`.
Stage C source/documentation changes are recorded in the commit containing this
report; the final diff was reviewed before committing.
Stage C is approved complete. Infrastructure and backup ownership enforcement
are verified. On November 16, 2026, the owner subsequently confirmed a successful
independent encrypted-backup unlock, completing the previously skipped check. **No application migration, synthetic
initialization, administrator bootstrap or application deployment was executed.**
No billing, trial, paid resource, custom domain or historical image change was made.
`www.liminalflagstaff.org` is untouched. The RSC issue remains unresolved.

## Provider identities and configuration

| Setting | Observed value |
| --- | --- |
| Neon organization | `org-patient-fire-50453705` / HelloJoyWolf, **Free** |
| Neon project | `noisy-block-56992135` / `liminal-portfolio` |
| Neon branch | `production`, `br-late-sunset-bc0auh1a`, primary/default |
| Database | `liminal_production`, PostgreSQL **17.12** |
| Neon region | AWS **us-east-1**, Virginia |
| Direct endpoint | `ep-cold-violet-bc14pcl7.c-16.us-east-1.aws.neon.tech` |
| Runtime pooler | `ep-cold-violet-bc14pcl7-pooler.c-16.us-east-1.aws.neon.tech` |
| Compute range | 0.25–2 CU; plan-default idle suspension (five minutes) |
| Recovery history setting | **21,600 seconds / six hours**, also bounded by Free storage allowance |
| Vercel account | `hello-joy-wolf`, **Hobby** |
| Vercel project | `liminal-portfolio`, `prj_Ymd5k6NoGiGTiF7OX6wraMuQxDBY` |
| Function region/runtime | `iad1`, Node **24.x**, Fluid Compute enabled |
| Build | Basic build machine, Next.js, `npm ci --include=dev`, `npm run build` |
| Reserved origin | `https://liminal-portfolio.vercel.app` |
| Deployments / Git integration | **Zero** / none |

The reserved origin completed a certificate-verified HTTPS/TLS 1.3 request and
returned **404**, as expected without a deployment. App routes, cookies, canonical
redirect behavior and live noindex headers remain Stage D verification items.
Noindex is configured in source and the production environment; it is not access
control. Both hosting and database are in Virginia, despite the earlier Ohio
console default.

Actual selected account plans were checked before provisioning and rechecked
at completion. The reviewed Free limits are 100 CU-hours/project/month, 1 GB DB
storage, 5 GB public egress, five-minute suspension, up to six hours OR 1 GB of
history and one snapshot; no paid scheduled backup or seven-day history is assumed.
Hobby has bounded transfer, invocation, compute and log allowances as documented
in [the deployment plan](phase-8-deployment.md). Accept quota interruptions; never
activate billing to resolve them. No availability or recovery SLA is promised.

## Roles, targeting and connections

Four separate LOGIN identities were created using the provider's database/schema
scoped role facilities. Live catalog checks verified no superuser, CREATEDB,
CREATEROLE, replication, BYPASSRLS or provider `neon_superuser` membership for any
of these roles:

| Role | Current access | Later Stage D grants |
| --- | --- | --- |
| `liminal_migrator` | Database/public-schema owner, local CREATE | Apply reviewed migrations only |
| `liminal_runtime` | CONNECT, schema USAGE; no CREATE | DML on 12 application tables only |
| `liminal_operator` | CONNECT, schema USAGE; no CREATE | Application DML and SELECT on migration metadata |
| `liminal_backup` | CONNECT, schema USAGE; no CREATE | SELECT on application tables and migration metadata |

PUBLIC database/schema privileges were revoked. No unsafe blanket/default runtime
grants were added. The provider administrator remains separate and is never the
runtime credential. There are **zero public tables**, no migration table, no
application records and no accounts. Future table grants require explicit review
after migrations; runtime must not read `_prisma_migrations` or become migrator.

An initial SQL self-grant approach to ownership failed (`0LP01`) and its transaction
rolled back. Ownership was then set through the supported Neon database-owner API,
followed by schema ownership and privilege verification. No role was elevated to
provider administrator. This provider difference is recorded rather than bypassed.

The existing Prisma PostgreSQL adapter/pg driver remains in use. Each instance has
at most **three** runtime connections and five-second idle/acquisition timeouts.
Vercel-only `attachDatabasePool` handles suspension cleanup. Neon transaction
pooling is used for runtime; migrations, operators and backups use direct verified
TLS connections. No separate server, cache, Neon Auth or other service was enabled.

Neon terminates TLS at its proxy: backend `pg_stat_ssl.ssl` reported false while
the actual client socket was encrypted with an authorized TLS 1.3 certificate.
The operator now validates the native `TLSSocket`, trust chain and exact endpoint
hostname. This retains certificate verification rather than relying on the wrong
network hop. Production URL checks allow only `sslmode=verify-full` plus optional
single `channel_binding=require`; weaker/duplicate/host-override options fail.
Node pg enables channel binding when offered; this option alone is not a strict
requirement if a server does not offer SCRAM-PLUS. Native pg_dump preserves
`PGCHANNELBINDING=require`. Local development/test targeting safeguards are intact.

## Secrets, provider tooling and scope

| Vercel variable name | Scope | Storage type |
| --- | --- | --- |
| `DATABASE_URL` | Production only | Sensitive Secret; restricted pooled runtime role |
| `BETTER_AUTH_SECRET` | Production only | Sensitive Secret; independently generated |
| `BETTER_AUTH_URL` | Production only | Encrypted Config; reserved HTTPS origin |
| `TEMPORARY_SITE_NOINDEX` | Production only | Encrypted Config; true |

Preview and development scopes have no production credentials. Vercel supplies
`NODE_ENV`/`VERCEL`. No migrator/operator/backup credentials are on Vercel.

Neon CLI 9.5.0 and Vercel CLI 65.16.0 were installed under Node 24.22.2 and
interactively authorized by the owner. Global Neon skills and the installed
Neon/Vercel plugin definitions were inspected, preserving existing configuration.
Native provider MCP tools were not exposed in this session; an MCP handshake was
not verified. Authenticated official CLIs performed provider work.

`neon.ts` declares PostgreSQL only (`auth: false`) and a seven-day TTL for future
new nondefault branches; no such branch was created. `neon deploy --no-env-pull`
reported no service changes. This is infrastructure reconciliation, not application
deployment. Exact CLI configuration dependencies were added: `@neon/config`
1.14.0 and `@neon/env` 2.1.3. `.neon` and `.vercel` metadata are ignored.
Vercel link created an ignored, mode-0600 `.env.local` containing its OIDC token;
existing `.env` contents were preserved. No secret values belong in this record.

## Firewall

The actual Hobby account accepted and published one free custom rate-limit rule:
`rule_liminal_login_throttle_6U0VG5`, “Liminal login throttle”. It matches
**POST `/api/auth/sign-in/email`**, uses **IP / fixed window / five requests per
60 seconds**, and returns **429** above the limit. Active version 1 was valid,
with no pending draft or bypass configuration. The owner performed publication
as required by the Vercel firewall skill. No app deployment occurred.

Counters are regional; fixed-window boundaries permit bursts. Effective ingress
throttling/reset and spoofed-forwarded-header resistance need testing against the
actual app in Stage D. Retain the existing in-process auth limiter. IP Bypass is
unavailable on Hobby and was not enabled or required. No paid fallback was used.

## Encrypted manual backups and restoration

The owner created `/Users/christopheralagna/LiminalBackups.dmg` outside the repo:
1 GB APFS, AES-256 encrypted, mounted at `/Volumes/LiminalBackups`.
`hdiutil` verified encryption. The image is mode 0600; its `private` folder is
mode 0700; files are mode 0600. The owner ran
`sudo diskutil enableOwnership /Volumes/LiminalBackups`; a subsequent read-only
`diskutil info` check verified `GlobalPermissionsEnabled=true`, and file/folder
ownership and private modes were rechecked. Keep the image ejected when unused. Its password must remain private and recoverable outside this chat.

The private folder holds a recovery copy of the separate connection settings and
auth secret in `operator-secrets.env`, plus `initial-backup-manifest.json` and the
initial dump. Never open or print the secrets file in logs/screenshots. Remounting
and viewing the private folder succeeded after mounting the attached volume in
Disk Utility. The owner subsequently confirmed that opening the mounted volume
and accessing its `private` folder works. The owner later explicitly confirmed
that the independent encrypted-backup unlock succeeded on November 16, 2026.
This is owner-confirmed password recovery, separate from the automated encryption,
permissions, archive and isolated restoration checks.

Client-only Homebrew `libpq@17` **17.12** was installed; use command-local PATH
`/opt/homebrew/opt/libpq@17/bin`. No PostgreSQL server/service or shell profile was
installed/changed. Dependencies include ICU, Kerberos, OpenSSL and CA certificates.
Homebrew temporarily changed default OpenSSL links; the prior OpenSSL 3 default
was restored, leaving versioned OpenSSL 4 for libpq's dependency.

The restricted backup role produced the pre-migration custom-format archive via
the **direct** endpoint with hostname/certificate verification, system CA trust
and required channel binding. Credentials were held in process/child environment,
not command arguments or output. Archive:

- `private/liminal-2026-11-16T08-01-30.102Z.dump`, **1,161 bytes**, mode 0600.
- SHA-256: `d24e62d16f90b96629a28499b3981289020a48091b86650d1818e873520116b9`.
- Catalog readable with pg_restore 17.12; production contained no application tables.

The archive was restored to uniquely named local PostgreSQL 17 Docker container
`liminal-stagec-recovery-20261116`, with **network disabled, no published ports,
separate tmpfs**, verified database/user `liminal_recovery` and empty target.
Restore used `--exit-on-error --no-owner --no-acl`, excluding only creation of the
already-existing empty public schema. There was no drop/clean or live overwrite.
Identity, archive hash, public schema, zero tables and READ ONLY/RepeatableRead
queries passed. Dump/restore verification took about **0.5 seconds**, excluding
startup; this is not an SLA. Only the owned recovery container/tmpfs was removed.
Development/test containers and volumes were retained.

This proves an **empty pre-migration** backup/isolated restore, not populated
application recovery, login recovery or provider point-in-time restoration.
After Stage D initialization, take another backup and rehearse populated schema,
constraints, checksums/counts and isolated app access with fresh nonproduction
secrets. Follow the [runbook](phase-8-deployment.md) for weekly/pre-change backups,
four weekly copies and pre-release retention. Manage the 1 GB image's capacity.
No automatic backup schedule exists; losses are bounded only by successful backup
age. A second existing encrypted copy is recommended for device-loss recovery;
no purchased storage is authorized.

## Validation and remaining approval

- Unit tests: **52 passed / 15 files**, including actual-socket TLS guards and
  production targeting/channel-binding cases. The focused backup tests also verify
  that the native child's channel-binding setting survives without argv secrets.
- PostgreSQL integration suite: **140 passed** against isolated local test DB.
- TypeScript, ESLint and Git whitespace checks passed.
- Fresh isolated install/Prisma generation/production webpack build passed in
  `/private/tmp/liminal-stagec-build-ud00xr_o`; the root development build was not
  used for this validation. Public pages were statically generated and admin/API
  routes remained dynamic. Seven existing moderate development-tool audit
  findings remain; no force-upgrade was applied.
- Live provider identity, plans, regions, role restrictions, verified TLS, empty
  schema, production-only variable scopes and active WAF configuration were checked.
- Full hosted application end-to-end proof is intentionally pending Stage D.

Stage C is approved complete, including owner-confirmed independent encrypted
backup unlock. See the [Stage D execution checklist](phase-8-stage-d-checklist.md);
preparation does not authorize execution. Filesystem ownership enforcement is verified. The Stage C
compatibility diff was reviewed for its commit. Obtain **explicit Stage D
authorization** naming:

1. The above actual production project/branch/database and reviewed source commit,
   unchanged migration SQL/checksums, current verified backup and recovery evidence.
2. Guarded `production:operator -- migrate` (`prisma migrate deploy` only), then
   reviewed explicit per-table grants to runtime/operator/backup as listed above.
3. Guarded `initialize`: approve the Phoenix start date and exact manifest again
   (eight synthetic volunteers, two roles/types, one two-occurrence pattern,
   four shifts/four assignments; no historical data).
4. Guarded `admin`: privately supply the owner's details/password and use the
   existing private Better Auth bootstrap. Never create a public signup endpoint.
5. First Vercel production deployment, followed by actual HTTPS noindex, auth,
   permissions, mutation/navigation, ingress rate-limit and cold-start checks.
   Capture sanitized RSC evidence; do not label the unresolved issue fixed.
6. A populated encrypted backup and isolated restore rehearsal, post-release
   evidence, and any separately approved rollback/recovery operation if needed.

Do not run these operations on Stage C authority. No automated deploy/Git link,
production migration, initialization or administrator creation has been enabled.
