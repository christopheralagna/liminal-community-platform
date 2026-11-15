import Link from "next/link";
import type { DashboardShift } from "@/server/admin/dashboard";
import { scheduleTime } from "./SchedulingDisplay";

export function DashboardShifts({ shifts, coverage, canWrite }: { shifts: DashboardShift[]; coverage?: boolean; canWrite: boolean }) {
  return <ul className="mt-4 space-y-3">{shifts.map(shift => <li key={shift.id} className="rounded-lg border border-charcoal-700 bg-charcoal-900 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="break-words font-semibold"><Link className="text-peach-200 underline" href={`/admin/scheduling/${shift.id}`}>{shift.name}</Link></h3>
        <p className="mt-2 text-sm text-cream-300">Required role: {shift.role}</p>
      </div>
      {coverage && <span className={`rounded border px-2 py-1 text-sm ${shift.assigned === 0 ? "border-peach-200 text-peach-200" : "border-charcoal-500 text-cream-200"}`}>{shift.assigned === 0 ? "No volunteers assigned" : "Partially staffed"}</span>}
    </div>
    <p className="mt-3 text-sm"><time dateTime={shift.startsAt.toISOString()}>{scheduleTime.format(shift.startsAt)}</time> to <time dateTime={shift.endsAt.toISOString()}>{scheduleTime.format(shift.endsAt)}</time></p>
    <p className="mt-2">{shift.assigned} of {shift.capacity} assigned{coverage && <> · {shift.remaining} {shift.remaining === 1 ? "spot" : "spots"} open</>}</p>
    {coverage && <Link className="mt-3 inline-block py-2 text-peach-200 underline" href={`/admin/scheduling/${shift.id}#assignments`}>{canWrite ? "Manage assignments" : "View assignments"}<span className="sr-only"> for {shift.name}, {scheduleTime.format(shift.startsAt)}</span></Link>}
  </li>)}</ul>;
}
