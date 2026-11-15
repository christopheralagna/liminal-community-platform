# Phase 5C — volunteer assignments and conflict detection

Implemented November 14, 2026. No deployment, database reset, migration, dependency upgrade, or public-site change was made.

The history-based edit/cancellation restrictions below describe the Phase 5C checkpoint. Phase 5D supersedes them; see [scheduling flexibility](phase-5d-scheduling-flexibility.md) for the current policy.

## Coordinator workflow

Open `/admin/scheduling/[id]`. The existing shift detail page now shows the required role, actual Phoenix interval, capacity, ASSIGNED staffing count, and remaining spots. Assigned volunteers link to their profiles. ADMIN and COORDINATOR can assign and cancel on future SCHEDULED shifts; VIEWER sees staffing and history without mutation controls. Completed/canceled shifts and assignments on started shifts are read-only.

The selector lists volunteers by name, including those who cannot be assigned. Selecting an ineligible volunteer explains the blocker. The selector is advisory: server mutations independently validate every requirement. The intentionally unpaginated list fits the approximately 25-volunteer scope.

Availability has three outcomes:

- **Available:** recorded Phoenix windows fully cover the actual shift; no acknowledgment.
- **Outside usual availability:** recorded Phoenix windows leave a gap; explicit acknowledgment required.
- **Unconfirmed or not recorded:** missing availability, or unsupported timezone information that could supply missing coverage; explicit acknowledgment required.

The checkbox permits an availability exception only. It cannot override inactivity, missing membership, overlap, capacity, duplicate/history restrictions, or shift status/time. After committed profile/shift/assignment changes, stale submissions require reloading and acknowledgment is invalidated. There is no food-handler enforcement. Existing scheduled shifts remain staffable when their shift type or operational role is inactive, provided the volunteer retains the required membership. Catalog inactivity continues to govern new shifts/generation, as in Phase 5B.

Canceling an ASSIGNED assignment changes it to CANCELLED, freeing capacity. The row, original volunteer/shift, and creation time remain. Assigning that volunteer again reactivates the same row, retaining its ID and creation time and advancing its modification time. COMPLETED rows cannot be changed. Replacement uses cancellation followed by assignment: another coordinator may fill the spot between those operations.

Canceled/completed assignments appear in collapsed history with first-assigned and last-changed times. The existing unique `(shiftId, volunteerId)` constraint remains. This captures the original relationship and latest modification, not every cancellation/reactivation event. No event-history model or completion workflow was added.

## Availability calculation

`src/server/scheduling/availability.ts` is a pure helper using existing Phoenix utilities. Enumerate dates touched by `[startsAt, endsAt)`, select matching weekday windows with inclusive effective dates, convert them to absolute intervals, sort/merge them, and require full coverage. End minute 1440 converts explicitly to next-day midnight. Adjacent windows meet without gaps; exact midnight endings do not occupy the next day. Overnight shifts require appropriate windows on each occupied date.

Phoenix has no daylight-saving changes and existing conversion is UTC−07:00. Non-Phoenix windows are preserved and are not passed through that conversion. Complete Phoenix coverage is sufficient even if other-zone windows also exist; incomplete Phoenix coverage with any other-zone information is conservatively UNCONFIRMED. No cross-zone conversion engine was introduced.

## Authorization, concurrency, and stale submissions

`src/server/scheduling/assignments.ts` independently checks live `scheduling:read` or `scheduling:write` authorization. Zod contracts are in `assignment-validation.ts`. Successful actions revalidate the dashboard, schedule, and affected detail page after commit; failures do not revalidate. Changes update in place through the action response, without client refresh/navigation calls. Client payloads contain only the candidate fields needed by the form.

Every assign/cancel/reactivate transaction acquires parameterized PostgreSQL locks in this order:

1. ShiftPattern, for a recurring shift.
2. Target Shift.
3. VolunteerProfile.
4. Existing ShiftAssignment, if present.

All checks and writes use the same READ COMMITTED transaction. Fresh reads occur after locks. The shift lock protects capacity and serializes against individual edits/cancellation; the pattern-first order also cooperates with bulk pattern mutations. The volunteer lock serializes simultaneous assignments to different shifts and cooperates with Phase 5A profile saves, which lock that profile before changing memberships/availability. Assignment status versions prevent old cancel/reactivate submissions from affecting newer changes; shift and volunteer versions invalidate stale form context. Creation expects no existing pair row. Versions use monotonic millisecond timestamps consistent with existing services.

Only ASSIGNED rows on SCHEDULED shifts count as overlapping commitments, using actual absolute timestamps: `other.startsAt < target.endsAt && other.endsAt > target.startsAt`. Adjacent intervals do not overlap. No recurring identity dates are used. Cancellation locks the same rows but need not reestablish volunteer eligibility, so coordinators can release an inactive volunteer's future assignment.

Conflict queries do not lock other shifts. No operation acquires another shift or pattern lock after acquiring a volunteer lock, avoiding opposite-order multi-shift lock cycles. Existing assignment history prevents committed assigned shifts from being moved underneath a conflict check. Profile saves do not acquire shift locks. Database uniqueness remains the duplicate safeguard, and SQL failures roll back the entire transaction. Unexpected errors are sanitized.

Eligibility is enforced at assignment/reactivation time. Existing Phase 5A policy remains: a later profile deactivation or membership removal retains existing assignments and does not automatically cancel them. If the profile edit wins the lock first, a stale assignment request is rejected; if assignment commits first, a subsequent profile edit preserves that assignment. This phase adds no retroactive enforcement policy.

## Phase 5B preservation and limits

Total assignment-history counts used by `shiftRestriction`, individual mutations, and bulk pattern changes remain unchanged. Staffing counts use ASSIGNED only. The older admin shift query now also selects ASSIGNED rather than including COMPLETED rows as current staffing.

A shift with any assignment history remains protected from time/capacity edits and cancellation, even after every assignment is canceled. Bulk shortening/cancellation likewise remains all-or-nothing when affected shifts have history. Only the obsolete explanation that assignment management is unavailable was updated. A possible later improvement is a separately designed, narrowly scoped edit/cancellation policy that preserves historical schedule details; Phase 5C does not implement it.

The intermittent React Server Component `enqueueModel` / closed-writable-stream issue documented in `phase-5b-scheduling.md` remains unresolved. New assignment forms follow the existing in-place action/revalidation convention. No overlay suppression, extra refreshes, framework upgrades, or assertion of a fix is included. If a response fails, inspect staffing/history before retrying because the transaction may have committed.

## Verification

Focused availability unit tests cover inclusive effective dates, weekday matching, exact interval boundaries, adjacent/overlapping windows, gaps, overnight coverage, midnight endings, missing availability, and unsupported timezones.

The 24 new PostgreSQL integration tests use guarded `TEST_DATABASE_URL`, actual database identity verification, committed migrations, real Better Auth sessions, and uniquely owned fixtures. Domain queries and locks are not mocked. Transaction wrappers coordinate entry and query timing while SQL executes on separate pooled PostgreSQL connections. Profile-race tests verify actual PostgreSQL lock waits before releasing uncommitted saves. Tests remove only their own fixtures.

Coverage includes successful assignment; direct service/action authorization; validation and forged fields; inactive/missing volunteers and missing roles; inactive catalog entries; historical/started shifts; duplicate/full rejection; cancellation/history preservation; same-row reactivation; stale retries; completed-row protection; overlaps versus adjacency; current availability acknowledgment; overnight and non-Phoenix availability; rollback after actual insert/cancel/reactivate SQL; VIEWER/writer rendering; successful-only route revalidation; final-slot contention between two authenticated coordinators; simultaneous overlapping/adjacent assignments; assignment versus edit/cancel; cancellation versus reactivation/replacement; profile deactivation/membership/availability races; and recurring assignment versus bulk cancellation.

Final validation with Node 24.22.2:

- All **100 PostgreSQL integration tests passed**, including the 24 Phase 5C tests.
- All **21 unit tests passed**, including four new availability tests.
- ESLint passed with zero warnings.
- TypeScript and the production build passed; all six public routes remain static.
- `git diff --check` passed.

The first sandboxed database attempt was blocked by loopback permissions; the approved local-test execution passed. No test failures remain. Browser checks below are still manual.

## Manual browser review

Browser interaction, responsive layout, and keyboard/focus behavior have not been verified in this implementation session. Server-rendering tests are not browser verification. Use the existing development app and synthetic records to review:

1. Assign a role-matching available volunteer to a future scheduled shift; confirm staffing and success feedback.
2. Try outside and unconfirmed availability, checking both acknowledgment paths.
3. Inspect inactive, missing-role, already-assigned, overlap, and full-shift feedback.
4. Cancel an assignment, inspect collapsed history, reactivate it, and replace it with another volunteer.
5. Confirm canceled history still blocks shift editing/cancellation and affected bulk operations.
6. Use VIEWER to inspect staffing/history and confirm there are no assignment controls.
7. In two coordinator sessions, compete for a final spot and attempt overlapping assignments for one volunteer; inspect saved results after stale feedback.
8. Check narrow screens, keyboard traversal, checkbox labels, error focus, success announcements, and development logs for the known intermittent stream issue.

No deployment is part of this phase.
