import Link from "next/link";
import { getDashboard } from "@/server/admin/queries";
import { readAdminPage } from "@/server/admin/page-access";
import { Notice } from "@/components/admin/Notice";
import { DashboardShifts } from "@/components/admin/DashboardShifts";
import { scheduleTime } from "@/components/admin/SchedulingDisplay";
import { phoenixDate } from "@/server/scheduling/dates";

export default async function DashboardPage() {
  const result = await readAdminPage(getDashboard);
  const data = result.data;
  const scheduleHref = data ? `/admin/scheduling?${new URLSearchParams({ view: "list", from: phoenixDate(data.windowStart), until: phoenixDate(data.windowEnd), canceled: "0" })}` : "/admin/scheduling";
  return <>
    <h1 className="text-3xl font-semibold">Dashboard</h1>
    <p className="mt-3 text-cream-300">Operational overview using synthetic demonstration records, not historical volunteer records.</p>
    {data ? <>
      <h2 className="mt-8 text-xl font-semibold">Next 7 days</h2>
      <p className="mt-2 text-cream-300"><time dateTime={data.windowStart.toISOString()}>{scheduleTime.format(data.windowStart)}</time> to <time dateTime={data.windowEnd.toISOString()}>{scheduleTime.format(data.windowEnd)}</time> · America/Phoenix</p>
      <p className="mt-2 text-sm text-cream-300">Shifts starting after now and before the end of this rolling 168-hour period. Shifts already in progress are excluded.</p>
      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["Active volunteers", data.activeVolunteers], ["Upcoming shifts", data.upcomingShifts], ["Shifts needing coverage", data.shiftsNeedingCoverage], ["Open volunteer spots", data.openVolunteerSpots]].map(([label, value]) => <div key={label} className="rounded-lg border border-charcoal-700 bg-charcoal-900 p-5"><dt className="text-sm text-cream-300">{label}</dt><dd className="mt-3 text-3xl font-semibold">{value}</dd></div>)}
      </dl>
      <p className="mt-4 text-sm text-cream-300">Volunteer count covers all active profiles. Shift totals cover this period; open spots counts individual positions. Only current assignments count toward staffing.</p>
      {!data.activeVolunteers && <div className="mt-5"><Notice>No active volunteers are recorded.</Notice></div>}
      <p className="mt-5 text-sm text-cream-300">Only existing scheduled occurrences are shown. Future dates that have not been generated from repeating schedules are not included. <Link className="text-peach-200 underline" href="/admin/scheduling/patterns">{data.canWrite ? "Manage repeating schedules" : "View repeating schedules"}</Link>.</p>
      <p className="mt-2 text-sm text-cream-300">Schedule links open these local calendar dates in list view; the schedule can also include earlier or completed shifts on those dates.</p>
      <section aria-labelledby="coverage-heading" className="mt-10">
        <h2 id="coverage-heading" className="text-xl font-semibold">Shifts needing coverage</h2>
        {data.coverage.length ? <><p className="mt-2 text-sm text-cream-300">Showing {data.coverage.length} of {data.shiftsNeedingCoverage} shifts needing coverage, soonest first.</p><DashboardShifts shifts={data.coverage} coverage canWrite={data.canWrite} /></> : <div className="mt-4"><Notice>{data.upcomingShifts ? "All upcoming shifts in this period are fully staffed." : "No upcoming scheduled shifts in this period to staff."}</Notice></div>}
        <Link className="mt-3 inline-block py-2 text-peach-200 underline" href={scheduleHref}>View schedule for this period</Link>
      </section>
      <section aria-labelledby="upcoming-heading" className="mt-10">
        <h2 id="upcoming-heading" className="text-xl font-semibold">Upcoming shifts</h2>
        {data.upcoming.length ? <><p className="mt-2 text-sm text-cream-300">Showing {data.upcoming.length} of {data.upcomingShifts} upcoming shifts, soonest first. Times are in America/Phoenix.</p><DashboardShifts shifts={data.upcoming} canWrite={data.canWrite} /></> : <div className="mt-4"><Notice>No upcoming scheduled shifts in the next 7 days.</Notice></div>}
        <Link className="mt-3 inline-block py-2 text-peach-200 underline" href={scheduleHref}>View full schedule for this period</Link>
      </section>
      <nav aria-label="Quick actions" className="mt-10">
        <h2 className="text-xl font-semibold">Quick links</h2>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-peach-200 underline">
          <Link className="py-2" href={scheduleHref}>View schedule</Link>
          {data.canWrite && <Link className="py-2" href="/admin/scheduling/new">Create a shift</Link>}
          <Link className="py-2" href="/admin/volunteers">{data.canWrite ? "Manage volunteers" : "View volunteers"}</Link>
          {data.canWrite && <Link className="py-2" href="/admin/volunteers/new">Create a volunteer</Link>}
          <Link className="py-2" href="/admin/scheduling/patterns">{data.canWrite ? "Manage repeating schedules" : "View repeating schedules"}</Link>
        </div>
      </nav>
    </> : <div className="mt-8"><Notice>{result.error}</Notice></div>}
  </>;
}
