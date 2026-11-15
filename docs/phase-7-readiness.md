# Phase 7 — approved security and reliability remediation

Implemented November 14, 2026, following Stage A review and explicit Stage B
approval. The user subsequently approved committing this work. Baseline: `2a9661d7`.
No dependency, schema, migration, infrastructure, scheduling-policy, public-site,
or local database-target safeguard changes. No database reset or deployment.

## Changes

- Volunteer saves revalidate after commit and redirect on the server with replace
  semantics. The client no longer calls router replace/refresh. Redirect control
  flow is rethrown; transport failures explain that the save may have committed
  and direct users to inspect the record before retrying. Creation IDs remain
  stable, and authorization/stale-edit/transaction behavior is preserved.
- Shared volunteer validation supplies field-addressable errors. The form focuses
  an alert summary, provides keyboard-operable correction buttons, associates
  inline errors using `aria-invalid`/`aria-describedby`, and retains values on
  validation, stale-edit, and transport failures.
- A fast navigation/submission experiment exposed native GET submission before
  hydration, with named fields entering the URL and no database mutation. The
  form now uses POST and disables its fieldset until the client submission handler
  is ready (`useSyncExternalStore` server/client snapshots). Server rendering and
  final browser creation/editing verify this guard. With JavaScript unavailable,
  the client-managed form remains disabled; it does not offer a no-JS editor.
- Unexpected page reads, volunteer/scheduling/assignment mutations, post-commit
  revalidation, and authentication request failures log one JSON event containing
  only event, static operation, generated UUID reference, UTC timestamp, and
  allowlisted classification/code. No request/record/user context, raw error,
  stack, credentials, connection URL, cookie, or personal detail is serialized.
  Generic UI feedback includes the reference. Expected validation/permission
  failures are not logged as unexpected failures. Browser transport failures
  without a received response cannot carry a server-generated reference.
- Revalidation failures explicitly report an already committed change and never
  replay the mutation. Server redirects remain outside those catch blocks.
- A production outage probe found Better Call's raw `SERVER_ERROR` console
  fallback bypassed Better Auth's disabled logger. `onAPIError.throw` now sends
  unexpected exceptions to the sanitized application boundary. The installed
  router preserves expected API-error HTTP responses; real auth regression tests
  verify normal login, wrong-password/origin/rate-limit responses and the absence
  of raw fallback logging. No library was patched or upgraded.
- [Production operations runbook](production-runbook.md) describes the remaining
  platform-neutral deployment and recovery procedures. It implements no
  production provisioning commands and preserves all local-only tooling guards.

## RSC investigation and evidence

Before changing application code, an authorized ADMIN used native Chrome and the
running development server to create and edit a clearly labeled synthetic
volunteer. DevTools Network showed successful HTTP 200 action responses followed
by **two detail-route RSC requests per save**. The detail UI displayed the saved
name; an independent guarded development-database read verified the edit committed.
No new browser stream errors occurred. Cold route compilation/HMR activity was
also present; the observation is not a controlled proof of causality.

After remediation, a comparable captured edit completed in its action response
without separate detail-route RSC fetches. Creation, repeated edits, a stale form
in a second tab, field-validation failures, keyboard correction, and an offline
save were exercised. Offline failure displayed the uncertain-save message; browser
network access was restored afterward. The browser extension could not reliably
drive input while offline/emulating a device, so the offline submission and
DevTools settings were operated through native Chrome accessibility controls.

Representative scheduling checks created a synthetic type and future one-time
shift, assigned the synthetic volunteer, changed capacity, canceled the assignment,
and canceled the shift. Type deactivation and volunteer status saves also worked.
No new `enqueueModel` or closed-stream errors appeared during these checks.

The existing `.next/dev/logs/next-development.log` retained the same six historical
entries at lines 7–12: browser/server copies of `enqueueModel`, closed-write, and
closed-close errors. They provide no application stack or mutation correlation.
No fresh occurrence was available from which to capture a diagnostic stack.

**The intermittent RSC issue is not considered resolved.** The redundant request
pattern is removed; the original trigger remains unproven. There are no automatic
mutation retries, error-overlay suppression, or experimental framework upgrades.

## Development versus production

Pristine baseline and final source copies were built under `/private/tmp`, using
the installed locked dependencies. The existing development process on port 3000
was left running. One mistaken repository-root build attempt failed type-checking
before the new diagnostics module existed; subsequent completed production builds
used isolated directories. An initial isolated copy also needed the omitted
`scripts` directory before its baseline build passed. Neither failed attempt is
counted as passing validation.

Baseline and final production servers on separate loopback ports each returned
200 for the six public routes and login, 307 from unauthenticated `/admin` to
`/admin/login`, and 200/no-store for unauthenticated session lookup. The final
server used an intentionally unreachable dummy database for an outage exercise;
public routes continued serving. Synthetic sign-in returned a generic 503/no-store
response and generated a matching safe authentication diagnostic reference.

These probes used internal loopback HTTP with an HTTPS auth origin configured.
They **do not verify public TLS/cookies/ingress or authenticated production-browser
mutation responses**. Those require the Phase 8 HTTPS staging environment. Owned
production preview processes were stopped after checks; no production secrets
were used. The first outage run revealed the raw fallback described above; the
final rebuilt run contained only the allowlisted event (`auth.request`, database
classification, `P1001`) with the same reference returned to the client. No raw
router fallback or Prisma exception appeared in that final production log.

## Validation

- PostgreSQL integration suite: **139 passed** (baseline 133; six added cases).
- Unit suite: **33 passed** (baseline 21; twelve added cases).
- ESLint and TypeScript (`--noEmit --incremental false`): passed.
- Fresh isolated production build: passed; public routes remain static.
- Git diff whitespace checks: passed.
- Browser: ADMIN volunteer create/edit; required-field and overlapping-availability
  feedback; summary focus and keyboard correction; retained values; stale edits;
  offline feedback; scheduling type/shift creation, assignment/capacity/cancellation;
  final post-hydration creation; 390px mobile layout without horizontal overflow.
- Real COORDINATOR operations and VIEWER direct service/action denial remain covered
  by the PostgreSQL suite. This session's mutation browser checks used ADMIN;
  COORDINATOR/VIEWER browser regression and screen-reader speech remain manual.

The first full remediation suite found one old assertion expecting the previous
generic scheduling-error text. Its contract assertion now checks safe feedback
with a reference; the rollback assertions remain intact. The corrected suite
passed. Redaction tests cover arbitrary fields, messages/stacks, untrusted codes
and operation names, throwing getters, and log-sink failures. Boundary tests cover
authentication failures, read references, preserved HTTP responses, and committed
writes despite revalidation failure.

## Synthetic browser records

Only named Phase 7 browser fixtures were created/changed for verification. Three
volunteer profiles remain **INACTIVE**:

- `6bcb65ac-ed30-4577-92a7-90a466c2382e` — baseline create/edit.
- `4ac54f19-f03c-46e4-af82-801b0c8af9a4` — remediation, availability, stale-edit,
  and assignment verification.
- `603b6ec4-b26e-48ee-91bb-d3f704df7031` — final guarded creation, created inactive.

Type `02bd7777-464c-4425-bd3b-e26db7f3bc01` is inactive. Its shift
`9a1e8a4e-dd0c-479b-81fc-b1a31653dc57` remains CANCELLED with capacity 2 and its
CANCELLED assignment history intact. No browser fixture/history was hard-deleted.
Automated fixtures used the separately guarded test database.

## Phase 8 verification gate and deferred decisions

1. In an HTTPS staging environment, record exact build/runtime versions and test
   authorized ADMIN/COORDINATOR volunteer create/edit, assignment, capacity, and
   schedule changes. Compare full navigation with client navigation, warm/cold
   routes, and development versus production using the same synthetic scenarios.
2. Record method/path/status/timing and redirect behavior without cookies, request
   bodies, or raw HAR exports. If a failure recurs, retain the browser stack and
   diagnostic reference, then independently inspect committed state before retry.
3. Confirm role denial, logout replay, cookies/origins, proxy header trust, and
   effective login limits through the actual ingress. Test keyboard/focus and a
   screen reader, including unavailable-database feedback.
4. Select hosting, database permissions/pool limits, secret handling, production
   bootstrap/recovery procedures, backup retention, and isolated restoration.
   Rehearse failed-migration and rollback procedures from the runbook.
5. Keep the development-only minimatch advisory tracked without dependency changes.
   Complete the separately planned public historical-image review before launch.

No schema change, new service, dependency update, or scheduling/assignment policy
change is required by this remediation. Deployment approval remains separate.
