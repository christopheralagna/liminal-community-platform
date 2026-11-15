# Phase 5D — scheduling flexibility and workflow refinement

Implemented November 14, 2026 and approved for commit after user review. No schema migration, applied-migration change, database reset, dependency change, deployment, or public-site change was made. Phase 5C's automated validation and manual browser testing were accepted by the user before this phase.

## Approved policy

Only future SCHEDULED shifts may change. Started, COMPLETED, and CANCELLED shifts remain read-only. ADMIN and COORDINATOR may write; VIEWER remains read-only. All mutation services independently enforce live permissions before validation or domain reads.

| Operation on a future scheduled shift | No ASSIGNED volunteers | With ASSIGNED volunteers |
| --- | --- | --- |
| Change date/time and capacity | Allowed | Blocked; cancel assignments first |
| Capacity-only update | Allowed | Allowed, at or above current ASSIGNED count |
| Individual cancellation | Allowed | Blocked; cancel assignments first |
| Bulk shortening/cancellation | Allowed if every affected shift has no ASSIGNED volunteers | Entire operation blocked with links to staffed shifts |

CANCELLED and COMPLETED assignment history does not block these operations and does not consume capacity. No scheduling operation deletes, cancels, reactivates, or otherwise rewrites those assignments. Time edits preserve shift ID, definition, pattern relationship, and immutable occurrenceDate; cancellation retains the shift itself. COMPLETED assignment rows on an otherwise eligible future scheduled shift are treated as history even though that combination is unusual.

There is no automatic assignment cancellation or controlled movement of active commitments. Coordinators cancel assignments explicitly before moving or canceling a staffed shift. Assignment eligibility, availability warnings, and same-row reactivation remain governed by Phase 5C. A canceled assignment reactivated after a move is evaluated against the shift's current interval, with current eligibility and required availability acknowledgment.

## Services and locking

`src/server/scheduling/service.ts` now separates general read-only restrictions (status/start time) from operation-specific active-staffing checks. Total-history reads remain available; individual mutation checks count ASSIGNED rows explicitly, and bulk mutations filter their assignment counts to ASSIGNED only.

`updateCapacity` is a distinct SchedulingCommand. Its strict Zod schema accepts only id, updatedAt, and an integer capacity from 1–1000. Unexpected properties, including time/status fields, are rejected. The service writes only capacity and its monotonic updatedAt version. Full editShift remains unavailable with active assignments, even if submitted times are unchanged; callers must use updateCapacity.

Individual time edits, capacity updates, and cancellation keep **Pattern (if any) → Shift** row-lock ordering. All state and staffing checks occur inside the transaction after acquiring the locks. Bulk operations retain **Pattern → affected Shifts in stable ID order**, then reread eligible state and active staffing before writing. Assignment mutations remain **Pattern → Shift → Volunteer → Assignment**. No new volunteer locks, cross-shift locks, or lock inversion was introduced.

The shared Shift lock serializes changes with assignment creation, cancellation, and reactivation. If an assignment wins first, time edits/cancellation see active staffing and fail; a capacity reduction cannot go below the committed count. If a shift change wins first, its updatedAt/status invalidates the waiting assignment's stale context. If assignment cancellation wins first, editing may proceed with the canceled row intact. Capacity-only changes do not affect overlap or availability because times are unchanged. READ COMMITTED checks run on fresh committed state after locks; no in-memory mutex is used.

Every shift write advances its timestamp version. Pattern changes retain existing stale-version checks, actual Phoenix start-date boundaries, all-or-nothing transactions, and rollback behavior. The generation algorithm and recurrence constraints are unchanged: existing canceled occurrence identities are skipped, not restored. A canceled moved occurrence still occupies its stored unique `(patternId, startsAt)` position; existing uniqueness may reject generation at a conflicting actual time rather than overwrite it.

## Interface and actions

The existing `/admin/scheduling/[id]` page shows:

- Normal edit and cancel controls when no ASSIGNED volunteers remain, including shifts with historical assignments.
- A capacity-only form and plain-language explanation when active volunteers prevent time changes/cancellation.
- A capacity input minimum of the displayed active staffing count; the server independently checks the live count.
- A historical-time notice beside time editing only when previous assignments exist.
- History interpretation text only when history exists, and reactivation text only when canceled assignments exist.

The existing assignment panel, profile links, history, and VIEWER permissions are preserved. Repeating-operation forms and blocked-shift feedback now explain active volunteers rather than treating all history as a blocker.

Capacity updates use the established in-place action/revalidation response, without client navigation or refresh. Their action invalidates the affected shift detail as well as the existing schedule/dashboard routes. Successful shortening/cancellation also invalidates shift detail pages so their status and controls are refreshed. Failures do not revalidate. Existing create/edit redirects remain server-managed.

## Historical limitation

Assignment rows preserve original creation time, latest modification time, volunteer, status, and shift association. They do not snapshot the interval that existed when someone was assigned or canceled. After a time edit, historical assignments refer to the shift's current schedule, including COMPLETED assignment history. The interface explicitly explains that original scheduled times are not retained. This limitation was approved; no audit subsystem or speculative snapshot migration was added.

The prior Phase 5B/5C history-freezing policy is superseded by this document. Those documents describe their original implementation checkpoints.

The known intermittent React Server Component enqueueModel / closed-writable-stream issue remains unresolved. This phase adds no framework change, overlay suppression, extra client refresh, or claim of a fix. If a response fails, inspect the saved shift before retrying.

## Validation

Existing PostgreSQL scheduling/assignment tests were updated only where the approved policy supersedes their old history-blocking assertions. Historical row preservation, stale checks, identity, rollback, and authorization assertions remain.

Seventeen new Phase 5D integration tests cover one-time and recurring edits/cancellation with CANCELLED/COMPLETED history; capacity increases and decreases above/at/below staffing; strict input validation; ADMIN/COORDINATOR writes and VIEWER denial; historical/non-scheduled write rejection; bulk history preservation and idempotent generation; mixed-history/active-staffing all-or-nothing rejection; relevant UI controls/notices; action revalidation; SQL rollback after writes; capacity races with assignment creation/reactivation; capacity increases and fresh retries; time edits/cancellation versus reactivation; assignment cancellation versus time edits; bulk operations versus reactivation; lock order and concurrent stale capacity edits; and current-interval availability checks after rescheduling.

Concurrency tests coordinate real pooled PostgreSQL transactions using the existing test instrumentation. Lock timing is controlled, while domain reads, counts, updates, and PostgreSQL row locks execute normally. Guarded TEST_DATABASE_URL identity checks, real Better Auth sessions, committed migrations, and uniquely owned fixture cleanup follow existing conventions. No test resets the database.

Final validation with Node 24.22.2:

- **117 PostgreSQL integration tests passed**, including all 17 new Phase 5D cases.
- **21 unit tests passed**.
- ESLint passed with zero warnings.
- TypeScript and the production build passed; all six public routes remain static.
- `git diff --check` passed.

No unresolved automated test failures remain. Phase 5D browser verification is still pending below.

## Focused manual browser checklist

Browser interaction, responsive layout, keyboard/focus behavior, and stream-error observation remain manual for Phase 5D; server-rendering tests do not establish browser verification.

1. Open a future one-time shift with no assignments. Confirm normal edit/cancel controls and no historical-time notice.
2. Assign a volunteer, then cancel their assignment. Confirm normal edit/cancel controls return. Move the time, confirm the historical notice, and verify canceled history remains inspectable. Cancel another such shift and inspect its preserved history.
3. Repeat the historical edit with a recurring occurrence. Check its original occurrence date remains stable while its actual time changes.
4. On a staffed future shift, confirm only capacity can change. Increase capacity, decrease above/at staffing, and attempt a decrease below staffing. Confirm no time/cancellation controls and clear guidance to cancel assignments first.
5. Reactivate a canceled volunteer after rescheduling. Review availability against the new interval and acknowledge any outside/unconfirmed warning. Confirm current overlaps and roles still block assignment.
6. Shorten/cancel a repeating schedule whose affected occurrences have only historical assignments. Confirm occurrences are canceled and history remains. Extend the shortened range and verify canceled identities are not restored.
7. Try a bulk operation with at least one affected staffed shift. Confirm nothing changes and the error links identify only shifts with active assignments.
8. In two coordinator sessions, race a capacity reduction against assignment/reactivation and try stale edits. Check saved staffing never exceeds capacity and stale requests explain reloading.
9. Confirm started/completed/canceled shifts stay read-only. Sign in as VIEWER and verify staffing/history remain visible with no mutation controls.
10. Check narrow-screen forms, keyboard traversal/error focus, in-place capacity feedback, and development logs for the known intermittent stream issue.

The user approved committing this phase after review. No deployment was performed.
