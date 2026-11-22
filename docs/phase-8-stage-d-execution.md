# Phase 8 Stage D — execution record

November 16, 2026, America/Phoenix. Owner execution authorization received for the
[reviewed checklist](phase-8-stage-d-checklist.md). **In progress; awaiting private
administrator entry. Application deployment has not run.** Source remains
`e3f497222b9179517ddfbe4789cf2db3cc5b702d`; additional changes are documentation
only and uncommitted. No migration SQL or application policy changed.

## Completed checks and writes

- Existing Neon project `noisy-block-56992135`, production branch
  `br-late-sunset-bc0auh1a`, PostgreSQL 17 / AWS us-east-1 and **Free** plan rechecked.
  Vercel `liminal-portfolio` / `prj_Ymd5k6NoGiGTiF7OX6wraMuQxDBY` remains **Hobby**,
  Node 24.x, iad1; zero deployments before database execution. No billing/trials,
  additional services, domains or historical image changes.
- Owner remounted `/Users/christopheralagna/LiminalBackups.dmg`. AES-256 encryption,
  enforced ownership, correct owner, 0700 folder and 0600 files/image verified.
  Initial archive hash exactly matched
  `d24e62d16f90b96629a28499b3981289020a48091b86650d1818e873520116b9`;
  pg_restore 17 catalog readable. Prior isolated restoration and owner-confirmed
  independent unlock evidence retained. The source was still empty immediately
  before migration, so the verified pre-migration archive remained applicable.
- Live direct target matched approved endpoint/database, `liminal_migrator`,
  PostgreSQL 17.12 primary, native TLS 1.3 certificate/hostname verification,
  migrator database/schema ownership and zero application tables.
- The existing guarded production operator applied exactly the two committed
  Prisma migrations. Both finished successfully and stored checksums matched:
  `20261108000000_initial`:
  `3825bf02d5cc65dcbf437d0f9b28b91344a8311c34d595293478aaafced7bbb0`;
  `20261110000000_shift_occurrence_date`:
  `5f6dc64f39d2af91d1d6984fdd0d880f826b6e6fdb406044fa5dd1ac79bc714e`.
- Readback verified 12 application tables plus migration metadata, all 36 named
  constraints validated, 21 expected indexes, enabled occurrence-identity trigger
  bound to `preserve_shift_occurrence_identity`, and all application tables empty.
- After a fresh live migrator identity check, explicit table grants committed in
  one transaction. Runtime/operator DML on the 12 app tables; backup SELECT on
  those plus migration metadata; operator SELECT on migration metadata. Catalog
  verification checked SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for
  all three roles on all 13 tables. No extra schema/database CREATE, elevated role
  attributes or migrator/provider membership. Fresh verified-TLS sessions passed
  RepeatableRead/READ ONLY queries; runtime migration-table access was actually
  denied (`42501`), operator/backup read both migration records successfully.
- Guarded initializer rechecked live identity/TLS, migration checksums, Phoenix
  date window and empty operational tables. November 17 remained within the
  approved window. Initialization committed once; no retry/reset occurred.
- Read-only post-initialization verification passed: 8 volunteers (7 active,
  1 inactive, all synthetic), 2 roles, 8 memberships, 56 availability rows,
  2 types, 1 pattern, 4 shifts, 4 assignments. Availability is 08:00–18:00,
  November 17–December 15. Phoenix shifts: November 17 and 24 at 09:00–11:00
  (recurring), November 18 and 20 at 14:00–16:00 (one-time); capacity 2 each,
  assignments respectively 2/1/0/1 chronologically. No users, credential accounts,
  sessions or verification records exist yet.

## Execution tooling and credential handoff

A temporary, public-code launcher outside the repository,
`/private/tmp/liminal-stage-d-operator.py`, runs the unchanged interactive
`scripts/production.ts` in a terminal. It supplies approved target/backup/manifest
confirmations and hidden connection input from the owner-only encrypted recovery
file. It does not disable or alter existing guards. Migration hashes and initial
backup hash are rechecked; secret values never enter arguments, documentation or
raw logs. Private administrator entry requires the owner's own terminal and prompts
for name/email and a hidden confirmed password; no placeholder credentials are
chosen. Production Better Auth secret is read privately from encrypted storage.
The launcher invokes the existing guarded Better Auth bootstrap and prints only a
sanitized success/failure result. It is not part of the deployed application.

Other temporary local inspection/grant scripts reused the production identity,
URL and native TLS assertions, validated live identity before writes, and emitted
only sanitized metadata/counts. No production account details have been collected
in chat. No unexpected production operation failure or automatic retry occurred.

## Still pending

1. Owner private administrator bootstrap; then read-only account/credential/session
   count and role verification without exposing identity or hashes. Stop and inspect
   if bootstrap fails; never rerun blindly.
2. First production deployment to `https://liminal-portfolio.vercel.app` from the
   reviewed application snapshot; no Git integration or automatic deployment.
3. Actual hosted HTTPS/noindex, authentication, authorization, WAF enforcement,
   origin/CSRF, public routes, mutation/navigation and cold-start verification.
   Owner login requires private credential entry. Non-admin permission tests and
   outage injection remain isolated-staging checks, not extra production accounts.
4. Populated encrypted backup and isolated PostgreSQL 17 restore, integrity/count
   checks and app recovery verification with fresh nonproduction secrets.
5. Final report of deployed commit/build/runtime, observed results and limitations.
   **RSC stream/navigation reliability remains unresolved.** Retain diagnostic IDs,
   inspect committed state before retry and stop progression on material failures.

The historical domain and images remain untouched. Documentation changes remain
separate and uncommitted as requested. No claim of deployment completion is made.
