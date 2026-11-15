# Phase 6 — admin dashboard and operational overview

Implemented November 14, 2026. The user reviewed the completed dashboard, reported that everything looked good, and approved committing Phase 6. No schema, applied migration, dependency, authentication configuration, public-site, or scheduling-policy changes are included. No database reset or deployment was performed.

## Dashboard behavior

`/admin` is a server-rendered operational overview with four metrics, up to five shifts needing coverage, up to five upcoming shifts, and permission-aware quick links. Coverage appears before the general upcoming list. Both lists use actual shift timestamps, ordered by start time and then ID. Completely unstaffed shifts have a text label and restrained accent border; partially staffed shifts have a distinct text label. Each row shows the required role, full Phoenix start/end dates and times, and active staffing. Coverage rows also show remaining spots and link directly to the existing shift detail assignment section.

The period is labeled **Next 7 days**, with both endpoints displayed in `America/Phoenix`. One captured instant defines the rolling 168-hour window. Eligible occurrences have status `SCHEDULED` and satisfy `startsAt > windowStart` and `startsAt < windowEnd`. Shifts starting exactly now or exactly at the upper boundary are excluded. Later-today starts are included; shifts already in progress are excluded even when they end during the window. Future overnight shifts are included by start time, with both dates displayed. Moved recurring occurrences are evaluated by their actual start, not immutable `occurrenceDate`.

| Metric | Definition |
| --- | --- |
| Active volunteers | All profiles with status `ACTIVE`, independent of the shift window |
| Upcoming shifts | Existing scheduled occurrences starting inside the window |
| Shifts needing coverage | Eligible occurrences with fewer `ASSIGNED` records than capacity |
| Open volunteer spots | Sum of `max(0, capacity - assignedCount)` across eligible occurrences |

Canceled/completed assignments are history and do not consume capacity. Existing `ASSIGNED` commitments held by inactive volunteers still count. Inactive shift types and operational roles do not hide existing scheduled occurrences. These calculations preserve Phase 5A/5C/5D policy.

Empty states distinguish no upcoming occurrences, no active profiles, and a nonempty period whose shifts are all fully staffed. Read failures display the existing unavailable notice rather than fabricated zero metrics. Dashboard rows contain no volunteer names or contact details.

Only recorded scheduled occurrences are reported. Dashboard reads never generate or extend a repeating schedule. The page explicitly explains this limitation and links to repeating schedules, including when the upcoming list is empty. It does not infer complete coverage of ungenerated dates.

## Data access and permissions

`src/server/admin/dashboard.ts` owns the read, with the existing `getDashboard` export retained in `src/server/admin/queries.ts`. It independently requires live `volunteers:read` and `scheduling:read` authorization before querying operational data. ADMIN, COORDINATOR, and VIEWER can read. Server-derived `canWrite` follows the existing ADMIN/COORDINATOR convention. VIEWER sees read-only navigation and no creation links. Destination services continue independently enforcing their existing permissions.

The read uses a short Prisma `RepeatableRead` transaction and PostgreSQL `SET TRANSACTION READ ONLY`. The profile count and all shift batches share a consistent snapshot without acquiring application row locks. Changes committed during a read appear on the next request. There is no dashboard cache, polling, background job, or client state.

Each shift query selects only the row fields, type/role names, and a relational `_count` filtered to `ASSIGNED`. Queries are restricted to the rolling window and read at most 200 shifts per batch. A `(startsAt, id)` continuation handles ties deterministically. Usually one batch suffices for this organization; additional batches preserve complete totals without retaining the entire result set. At most five rows per dashboard section are retained. Existing indexes on shift timestamps and the assignment unique key's `shiftId` prefix support these reads; no additional index was justified at this scale.

Schedule links use existing `view=list`, `from`, `until`, and `canceled=0` parameters for the local dates touched by the dashboard window. There is no new coverage filter. Because the schedule uses calendar-date overlap and can show completed shifts, the page explains that its results may include additional occurrences outside the dashboard's exact rolling interval. Coverage links go directly to `/admin/scheduling/[id]#assignments`.

## Changed files

- `src/server/admin/dashboard.ts`: dedicated authorized snapshot read and compact result type.
- `src/server/admin/queries.ts`: replace the old all-date dashboard query with the retained export.
- `src/app/admin/(protected)/page.tsx`: operational metrics, sections, empty states, and quick links.
- `src/components/admin/DashboardShifts.tsx`: shared server-rendered shift rows with semantic timestamps and descriptive assignment links.
- `src/app/admin/(protected)/scheduling/[id]/page.tsx`: add the assignment heading anchor.
- `tests/integration/dashboard.test.ts`: focused dashboard coverage.
- `tests/integration/auth.test.ts`: assert the dashboard's new upcoming-window metric.
- `docs/phase-6-dashboard.md`: architecture, validation, and review checklist.

## Automated validation

The 16 new dashboard integration tests use deterministic dashboard times, uniquely owned synthetic fixtures, real PostgreSQL queries, and real Better Auth sessions. Cleanup removes only test-owned records. The zero-active-profile presentation case supplies a zero count without deleting unrelated test data. Page tests supply the dashboard clock through service wiring without changing session time.

Coverage includes active-profile counts; inactive volunteers' existing assignments; partially staffed, fully staffed, and unstaffed shifts; capacities above one; historical assignments; canceled/completed shifts; exact time boundaries; overnight and moved recurring shifts; inactive types/roles; empty shift results; list limits and deterministic ties across a 200-row batch boundary; all three roles and live role changes; disabled/anonymous sessions; schedule URLs and assignment anchors; fresh reads after changes; unavailable states; and unchanged occurrences, assignments, and repeating schedules after reads.

A concurrency test commits an assignment, a volunteer, and a new shift between batches and verifies that the first response keeps its original snapshot while the next response sees the changes. Another test attempts a write inside the dashboard transaction and verifies that PostgreSQL rejects it as read-only without changing records.

Final validation with Node 24.22.2:

- Focused dashboard tests: **16 passed**.
- Full PostgreSQL integration suite: **133 passed** across seven files (the previous 117 plus 16 dashboard cases).
- Unit suite: **21 passed** across six files.
- ESLint: passed with zero warnings.
- TypeScript: passed.
- Production build: passed; `/admin` remains dynamic and all six public routes remain static.
- `git diff --check`: passed.

The first focused run exposed two assertion assumptions: React static markup retains the `dateTime` spelling, and Better Auth rejects disabled sessions before the application role read, producing an authentication redirect. The corrected tests pass. No unresolved automated failures remain.

## Browser review checklist

The user reviewed the dashboard and approved committing it. Agent-run browser layout, keyboard/focus behavior, and stream-error observation were not performed in this implementation session; server-rendering tests do not establish browser verification. The checklist is retained for further regression review, without claiming that every item was individually verified.

1. Open `/admin` as ADMIN and COORDINATOR. Confirm the period endpoints, four totals, five-row limits, chronological ordering, and visible creation links.
2. Check unstaffed, partially staffed, and fully staffed shifts against the detail page's current staffing. Confirm canceled/completed assignments do not inflate coverage; an inactive volunteer's existing assigned commitment still counts.
3. Follow coverage assignment links and confirm the destination scrolls to Assigned volunteers. Follow section schedule links and confirm the expected local date range and list view; observe the explained calendar-versus-rolling difference.
4. Check an overnight shift and a moved recurring occurrence. Both dates should be readable, and actual scheduled times should determine inclusion.
5. Confirm the no-upcoming, all-staffed, and no-active-profile states with suitable synthetic data. Ensure the recorded-occurrences explanation and repeating-schedule navigation remain visible.
6. Sign in as VIEWER. Confirm detail/schedule/profile/repeating-schedule navigation remains available, creation links are absent, and existing destinations stay read-only.
7. Check narrow and wide screens, long type/role names, heading navigation, keyboard focus, and descriptive link names. No meaning should depend solely on color.
8. Change staffing or capacity through an existing workflow and return to the dashboard. Verify the next request reflects committed data.
9. Observe browser and development logs while navigating. The previously documented React Server Component `enqueueModel` / closed-writable-stream issue remains unresolved; this phase adds no client refresh, polling, dependency upgrade, or claimed framework fix. Record any recurrence before retrying an operation.
