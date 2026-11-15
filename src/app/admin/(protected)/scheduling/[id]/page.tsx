import Link from "next/link";
import { notFound } from "next/navigation";
import { getShift } from "@/server/scheduling/service";
import { dateOnly, phoenixDate } from "@/server/scheduling/dates";
import { readAdminPage } from "@/server/admin/page-access";
import { Notice } from "@/components/admin/Notice";
import { SchedulingNav, scheduleTime, ShiftState } from "@/components/admin/SchedulingDisplay";
import { CancelShift, CapacityForm, ShiftForm } from "@/components/admin/SchedulingForms";
import { assignmentRestriction, getAssignmentCandidates } from "@/server/scheduling/assignments";
import { AssignVolunteer, CancelAssignment, StaffingFeedback } from "@/components/admin/ShiftStaffing";
const localTime = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Phoenix", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
export default async function ShiftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const result = await readAdminPage(async () => {
    const detail = await getShift(id);
    if (!detail) return null;
    const staffingRestriction = assignmentRestriction(detail.shift);
    const candidates = detail.canWrite && !staffingRestriction ? await getAssignmentCandidates(id) : [];
    return { ...detail, staffingRestriction, candidates };
  }, "scheduling.read");
  if (result.error) return <Notice>{result.error}</Notice>;
  if (!result.data) notFound();
  const { shift, canWrite, restriction, staffingRestriction, candidates } = result.data;
  const active = shift.assignments.filter(assignment => assignment.status === "ASSIGNED");
  const history = shift.assignments.filter(assignment => assignment.status !== "ASSIGNED");
  return <><SchedulingNav /><h1 className="text-3xl font-semibold">{shift.definition.name}</h1>
    {saved === "1" && <div className="mt-5"><Notice>Shift saved.</Notice></div>}
    <div className="mt-6 space-y-3 rounded-lg border border-charcoal-700 p-5"><p>Required operational role: {shift.definition.role.name}</p><p>{scheduleTime.format(shift.startsAt)} to {scheduleTime.format(shift.endsAt)} · America/Phoenix</p><p>Capacity: {shift.capacity}</p><p>{active.length} of {shift.capacity} spots filled · {Math.max(0, shift.capacity - active.length)} remaining</p><ShiftState status={shift.status} />
      <div>{shift.patternId ? <><Link className="text-peach-200 underline" href={`/admin/scheduling/patterns/${shift.patternId}`}>Repeating schedule</Link><details className="mt-3"><summary className="cursor-pointer">Scheduling record details</summary>Original calendar date: {dateOnly(shift.occurrenceDate!)}, in {shift.pattern!.timeZone}</details></> : "One-time shift"}</div>
    </div>
    {!canWrite && <p className="mt-5">Read-only access.</p>}
    {restriction && <p className="mt-5 text-cream-300">{restriction}</p>}
    {canWrite && !restriction && active.length > 0 && <>
      <p className="mt-5 text-cream-300">Cancel assigned volunteers before changing this shift’s time. Cancel assignments before canceling this shift. You can change capacity below.</p>
      <CapacityForm key={`${id}:${shift.updatedAt.toISOString()}:capacity`} id={id} updatedAt={shift.updatedAt.toISOString()} capacity={shift.capacity} activeAssignments={active.length} />
    </>}
    {canWrite && !restriction && active.length === 0 && <><ShiftForm key={`${id}:${shift.updatedAt.toISOString()}`} id={id} updatedAt={shift.updatedAt.toISOString()} hasHistory={history.length > 0} initial={{ date: phoenixDate(shift.startsAt), endDate: phoenixDate(shift.endsAt), start: localTime(shift.startsAt), end: localTime(shift.endsAt), capacity: shift.capacity }} /><CancelShift id={id} updatedAt={shift.updatedAt.toISOString()} hasHistory={history.length > 0} /></>}
    <StaffingFeedback><h2 id="assignments" className="mt-8 text-xl font-semibold">Assigned volunteers</h2>
    {staffingRestriction && <p className="mt-3 text-cream-300">{staffingRestriction}</p>}
    {active.length ? <ul className="mt-4 space-y-4">{active.map(assignment => <li key={assignment.id}>
      <Link className="text-peach-200 underline" href={`/admin/volunteers/${assignment.volunteerId}`}>{assignment.volunteer.displayName}</Link> · Assigned
      {canWrite && !staffingRestriction && <CancelAssignment shiftId={id} shiftUpdatedAt={shift.updatedAt.toISOString()} volunteerId={assignment.volunteerId} assignmentUpdatedAt={assignment.updatedAt.toISOString()} name={assignment.volunteer.displayName} />}
    </li>)}</ul> : <p className="mt-3 text-cream-300">No volunteers assigned.</p>}
    {canWrite && !staffingRestriction && <AssignVolunteer shiftId={id} shiftUpdatedAt={shift.updatedAt.toISOString()} candidates={candidates} />}
    <details className="mt-8 rounded-lg border border-charcoal-700 p-5"><summary className="cursor-pointer text-xl font-semibold">Assignment history ({history.length})</summary>
      {history.length ? <ul className="mt-4 space-y-3">{history.map(assignment => <li key={assignment.id}>
        <Link className="text-peach-200 underline" href={`/admin/volunteers/${assignment.volunteerId}`}>{assignment.volunteer.displayName}</Link> · {assignment.status === "CANCELLED" ? "Canceled" : "Completed"}
        <p className="text-sm text-cream-300">First assigned {scheduleTime.format(assignment.createdAt)} · Last changed {scheduleTime.format(assignment.updatedAt)}</p>
      </li>)}</ul> : <p className="mt-3 text-cream-300">No canceled or completed assignments.</p>}
      {history.length > 0 && <p className="mt-3 text-sm text-cream-300">History refers to this shift’s current schedule. Original scheduled times and individual cancellation or restoration events are not retained.</p>}
      {history.some(assignment => assignment.status === "CANCELLED") && <p className="mt-3 text-sm text-cream-300">Assigning a canceled volunteer again restores their assignment.</p>}
    </details></StaffingFeedback>
  </>;
}
