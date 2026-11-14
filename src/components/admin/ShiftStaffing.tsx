"use client";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { assignmentAction } from "@/app/admin/(protected)/scheduling/assignment-actions";
import { availabilityMessages } from "@/server/scheduling/availability";
import type { AssignmentCandidate, AssignmentCommand, AssignmentResult } from "@/server/scheduling/assignment-validation";

const button = "min-h-11 rounded bg-cream-100 px-4 py-2 font-semibold text-charcoal-900 disabled:opacity-50";
const StaffingStatus = createContext<(message: string | null) => void>(() => {});
export function StaffingFeedback({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  return <StaffingStatus.Provider value={setMessage}>{message && <p className="mt-5" role="status">{message}</p>}{children}</StaffingStatus.Provider>;
}
function useAssignmentMutation() {
  const report = useContext(StaffingStatus);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<AssignmentResult | null>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (feedback && !feedback.ok) alert.current?.focus(); }, [feedback]);
  const submit = (command: AssignmentCommand, input: unknown) => {
    if (pending) return;
    setFeedback(null);
    report(null);
    startTransition(async () => {
      try { const result = await assignmentAction(command, input); setFeedback(result); if (result.ok) report(result.message); }
      catch (error) {
        unstable_rethrow(error);
        setFeedback({ ok: false, error: "The response could not be received. Check the shift before trying again; your change may already have saved." });
      }
    });
  };
  return { pending, submit, feedback, clear: () => setFeedback(null), alert };
}
function Feedback({ feedback, alert }: { feedback: AssignmentResult | null; alert: React.RefObject<HTMLParagraphElement | null> }) {
  return feedback && !feedback.ok ? <p ref={alert} role="alert" tabIndex={-1} className="text-peach-100">{feedback.error}</p> : null;
}
export function AssignVolunteer({ shiftId, shiftUpdatedAt, candidates }: { shiftId: string; shiftUpdatedAt: string; candidates: AssignmentCandidate[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [acknowledgedContext, setAcknowledgedContext] = useState<string | null>(null);
  const mutation = useAssignmentMutation();
  const selected = candidates.find(candidate => candidate.id === selectedId);
  // A changed volunteer, assignment, or shift invalidates prior acknowledgment.
  const context = `${selectedId}:${selected?.volunteerUpdatedAt}:${selected?.assignmentUpdatedAt}:${shiftUpdatedAt}`;
  const acknowledged = acknowledgedContext === context;
  const availability = mutation.feedback && !mutation.feedback.ok && mutation.feedback.availability ? mutation.feedback.availability : selected?.availability;
  const warning = availability && availability !== "AVAILABLE";
  return <form className="mt-5 space-y-4 rounded-lg border border-charcoal-700 p-5" aria-busy={mutation.pending} onSubmit={event => {
    event.preventDefault();
    if (!selected || selected.blocker) return;
    mutation.submit("assign", { shiftId, shiftUpdatedAt, volunteerId: selected.id, volunteerUpdatedAt: selected.volunteerUpdatedAt, assignmentUpdatedAt: selected.assignmentUpdatedAt, acknowledgeAvailability: acknowledged });
  }}>
    <h3 className="text-lg font-semibold">Assign volunteer</h3>
    <label className="block">Volunteer<select className="mt-2 block min-h-11 w-full rounded border border-charcoal-600 bg-charcoal-900 p-3" required disabled={mutation.pending} value={selectedId} onChange={event => { setSelectedId(event.target.value); setAcknowledgedContext(null); mutation.clear(); }}>
      <option value="">Select a volunteer</option>
      {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.blocker ? " — cannot assign" : candidate.availability === "AVAILABLE" ? " — available" : candidate.availability === "OUTSIDE" ? " — outside usual availability" : " — availability unconfirmed"}</option>)}
    </select></label>
    {!candidates.length && <p>No volunteers recorded.</p>}
    {selected?.blocker && <p className="text-peach-100">{selected.blocker}</p>}
    {selected && availability && <p>{availabilityMessages[availability]}</p>}
    {selected && !selected.blocker && warning && <label className="flex items-start gap-3"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={acknowledged} disabled={mutation.pending} onChange={event => setAcknowledgedContext(event.target.checked ? context : null)} />I acknowledge this availability information and want to assign this volunteer.</label>}
    <Feedback feedback={mutation.feedback} alert={mutation.alert} />
    <button className={button} disabled={mutation.pending || !selected || !!selected.blocker || (!!warning && !acknowledged)}>{mutation.pending ? "Saving…" : "Assign volunteer"}</button>
  </form>;
}
export function CancelAssignment({ shiftId, shiftUpdatedAt, volunteerId, assignmentUpdatedAt, name }: { shiftId: string; shiftUpdatedAt: string; volunteerId: string; assignmentUpdatedAt: string; name: string }) {
  const mutation = useAssignmentMutation();
  return <form className="mt-2 space-y-2" aria-busy={mutation.pending} onSubmit={event => { event.preventDefault(); mutation.submit("cancel", { shiftId, shiftUpdatedAt, volunteerId, assignmentUpdatedAt }); }}>
    <button className={button} disabled={mutation.pending} aria-label={`Cancel assignment for ${name}`}>{mutation.pending ? "Saving…" : "Cancel assignment"}</button>
    <Feedback feedback={mutation.feedback} alert={mutation.alert} />
  </form>;
}
