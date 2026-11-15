"use client";

import { useState, useTransition, useRef, useEffect, useId, useSyncExternalStore } from "react";
import { unstable_rethrow } from "next/navigation";
import { saveVolunteerAction } from "@/app/admin/(protected)/volunteers/actions";
import { DEFAULT_TIME_ZONE, weekdays, volunteerSchema, volunteerFieldErrors, volunteerFieldLabel, type VolunteerInput } from "@/server/volunteers/validation";

const control = "mt-1 block w-full rounded border border-charcoal-600 bg-charcoal-900 px-3 py-2 text-cream-100 disabled:opacity-80";
const button = "rounded border border-charcoal-500 px-4 py-2 disabled:opacity-50 hover:bg-charcoal-800";
type Props = { initial: VolunteerInput; roles: { id: string; name: string; isActive: boolean }[]; canWrite: boolean; mode: "create" | "update"; today: string };
// Client-managed submission must not fall back to a native GET before hydration.
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function VolunteerForm({ initial, roles, canWrite, mode, today }: Props) {
  const [value, setValue] = useState(initial);
  const [feedback, setFeedback] = useState<{ error: string; issues?: string[]; fieldErrors?: Record<string, string> } | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const prefix = useId();
  useEffect(() => { if (feedback) alertRef.current?.focus(); }, [feedback]);
  const fieldId = (name: string) => `${prefix}-${name}`;
  const fieldProps = (name: string) => ({ name, id: fieldId(name),
    "aria-invalid": feedback?.fieldErrors?.[name] ? true as const : undefined,
    "aria-describedby": feedback?.fieldErrors?.[name] ? `${fieldId(name)}-error` : undefined });
  const fieldError = (name: string) => feedback?.fieldErrors?.[name]
    ? <span className="mt-2 block text-sm text-peach-100" id={`${fieldId(name)}-error`}>{feedback.fieldErrors[name]}</span> : null;
  function field<K extends keyof VolunteerInput>(name: K, next: VolunteerInput[K]) { setFeedback(null); setValue(current => ({ ...current, [name]: next })); }
  function windowField(index: number, name: string, next: string | number) {
    setFeedback(null);
    setValue(current => ({ ...current, availability: current.availability.map((window, i) => i === index ? { ...window, [name]: next } : window) }));
  }
  return <form ref={formRef} method="post" noValidate aria-busy={pending || !ready} className="mt-6 space-y-8" onSubmit={event => {
    event.preventDefault();
    if (pending || !canWrite || !ready) return;
    const validated = volunteerSchema.safeParse(value);
    if (!validated.success) {
      setFeedback({ error: "Please correct the following fields.", fieldErrors: volunteerFieldErrors(validated.error) });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await saveVolunteerAction(mode, value);
        if (!result.ok) { setFeedback(result); return; }
      } catch (error) {
        unstable_rethrow(error);
        setFeedback({ error: "The response could not be received. Your changes may have saved. Inspect the volunteer record from the volunteer list before trying again; retrying this form keeps the same record ID." });
      }
    });
  }}>
    {!canWrite && <p className="text-cream-300">Read-only access. An administrator or coordinator can update this record.</p>}
    {feedback && <div ref={alertRef} tabIndex={-1} role="alert" aria-labelledby={`${prefix}-errors`} className="rounded border border-red-400 p-4">
      <h2 id={`${prefix}-errors`} className="font-semibold">{feedback.error}</h2>
      {feedback.fieldErrors ? <ul className="mt-2 list-disc pl-5">{Object.entries(feedback.fieldErrors).map(([name, message]) => <li key={name}>
        <button type="button" className="text-left underline" onClick={() => {
          const control = formRef.current?.elements.namedItem(name);
          if (control instanceof HTMLElement) control.focus();
          else document.getElementById(fieldId(name))?.focus();
        }}>{volunteerFieldLabel(name)}: {message}</button>
      </li>)}</ul> : feedback.issues && <ul className="mt-2 list-disc pl-5">{feedback.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
    </div>}
    <fieldset disabled={!canWrite || pending || !ready} className="space-y-8">
      <legend className="sr-only">Volunteer information</legend>
      <section aria-labelledby="profile-heading" className="rounded-lg border border-charcoal-700 p-5">
        <h2 id="profile-heading" className="text-xl font-semibold">Profile</h2>
        <p className="mt-2 text-sm text-cream-300">A volunteer record does not create an application login account.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label>Name <span aria-hidden="true">*</span><input className={control} required maxLength={120} autoComplete="name" {...fieldProps("displayName")} value={value.displayName} onChange={e => field("displayName", e.target.value)} />{fieldError("displayName")}</label>
          <label>Email (optional)<input className={control} type="email" maxLength={254} autoComplete="email" {...fieldProps("email")} value={value.email} onChange={e => field("email", e.target.value)} />{fieldError("email")}</label>
          <label>Status<select className={control} {...fieldProps("status")} value={value.status} onChange={e => field("status", e.target.value as VolunteerInput["status"])}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>{fieldError("status")}</label>
        </div>
        <p className="mt-3 text-sm text-cream-300">Inactive volunteers remain in administrative records. Status changes preserve historical assignments.</p>
      </section>
      <section id={fieldId("roleIds")} tabIndex={-1} aria-describedby={feedback?.fieldErrors?.roleIds ? `${fieldId("roleIds")}-error` : undefined} aria-labelledby="roles-heading" className="rounded-lg border border-charcoal-700 p-5">
        <h2 id="roles-heading" className="text-xl font-semibold">Operational roles</h2>
        <p className="mt-2 text-sm text-cream-300">Select all activities this volunteer is authorized to perform. These roles do not grant application access.</p>
        <div className="mt-4 flex flex-wrap gap-5">{roles.map(role => <label key={role.id} className="flex items-center gap-2"><input type="checkbox" checked={value.roleIds.includes(role.id)} onChange={e => field("roleIds", e.target.checked ? [...value.roleIds, role.id] : value.roleIds.filter(id => id !== role.id))} />{role.name}{!role.isActive && " (inactive role)"}</label>)}</div>
        {fieldError("roleIds")}
        {!roles.length && <p className="mt-3">No operational roles are recorded.</p>}
        {!value.roleIds.length && <p className="mt-3 text-sm text-cream-300">No roles assigned.</p>}
      </section>
      <section id={fieldId("availability")} tabIndex={-1} aria-describedby={feedback?.fieldErrors?.availability ? `${fieldId("availability")}-error` : undefined} aria-labelledby="availability-heading" className="rounded-lg border border-charcoal-700 p-5">
        <h2 id="availability-heading" className="text-xl font-semibold">Weekly availability</h2>
        <p className="mt-2 text-sm text-cream-300">Local times in America/Phoenix for new windows. Effective dates include both start and end dates; a blank end date continues indefinitely. Windows cannot overlap in time and effective dates. Split overnight availability across two days. This information does not enforce scheduling eligibility.</p>
        {fieldError("availability")}
        {!value.availability.length && <p className="mt-4">No availability recorded; availability is unknown.</p>}
        {weekdays.map((day, weekday) => {
          const windows = value.availability.map((window, index) => ({ window, index })).filter(({ window }) => window.dayOfWeek === weekday);
          return <div key={day} className="mt-6 border-t border-charcoal-700 pt-4">
            <h3 className="font-semibold">{day}</h3>
            {!windows.length && <p className="mt-2 text-sm text-cream-300">No windows recorded.</p>}
            {windows.map(({ window, index }, dayIndex) => <fieldset key={window.id} className="mt-3 rounded border border-charcoal-700 p-4">
              <legend className="px-1 text-sm">{day} window {dayIndex + 1} · {window.timeZone}</legend>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label>Start time<input className={control} required type="time" {...fieldProps(`availability.${index}.start`)} value={window.start} onChange={e => windowField(index, "start", e.target.value)} />{fieldError(`availability.${index}.start`)}</label>
                <label>End time{window.end === "24:00" ? <input className={control} disabled value="Midnight (end of day)" /> : <input className={control} required type="time" {...fieldProps(`availability.${index}.end`)} value={window.end} onChange={e => windowField(index, "end", e.target.value)} />}{fieldError(`availability.${index}.end`)}</label>
                <label>Effective from<input className={control} required type="date" {...fieldProps(`availability.${index}.validFrom`)} value={window.validFrom} onChange={e => windowField(index, "validFrom", e.target.value)} />{fieldError(`availability.${index}.validFrom`)}</label>
                <label>Effective until (optional)<input className={control} type="date" min={window.validFrom} {...fieldProps(`availability.${index}.validUntil`)} value={window.validUntil} onChange={e => windowField(index, "validUntil", e.target.value)} />{fieldError(`availability.${index}.validUntil`)}</label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={window.end === "24:00"} onChange={e => windowField(index, "end", e.target.checked ? "24:00" : "17:00")} />Ends at midnight (24:00)</label>
              {canWrite && <button className={`${button} mt-3`} type="button" onClick={() => field("availability", value.availability.filter(item => item.id !== window.id))}>Remove {day} window {dayIndex + 1}</button>}
            </fieldset>)}
            {canWrite && <button type="button" className={`${button} mt-3`} onClick={() => field("availability", [...value.availability, { id: crypto.randomUUID(), dayOfWeek: weekday, start: "09:00", end: "12:00", timeZone: DEFAULT_TIME_ZONE, validFrom: today, validUntil: "" }])}>Add {day} window</button>}
          </div>;
        })}
      </section>
      <section aria-labelledby="certificate-heading" className="rounded-lg border border-charcoal-700 p-5">
        <h2 id="certificate-heading" className="text-xl font-semibold">Food-handler certificate</h2>
        <p className="mt-2 text-sm text-cream-300">Optional and informational. Missing dates mean unknown; these dates do not grant operational roles or establish a certification requirement.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label>Issued on (optional)<input className={control} type="date" {...fieldProps("foodHandlerIssuedOn")} value={value.foodHandlerIssuedOn} onChange={e => field("foodHandlerIssuedOn", e.target.value)} />{fieldError("foodHandlerIssuedOn")}</label>
          <label>Expires on (optional)<input className={control} type="date" min={value.foodHandlerIssuedOn || undefined} {...fieldProps("foodHandlerExpiresOn")} value={value.foodHandlerExpiresOn} onChange={e => field("foodHandlerExpiresOn", e.target.value)} />{fieldError("foodHandlerExpiresOn")}</label>
        </div>
        {(!value.foodHandlerIssuedOn || !value.foodHandlerExpiresOn) && <p className="mt-3 text-sm text-cream-300">{!value.foodHandlerIssuedOn && "Issuance date unknown. "}{!value.foodHandlerExpiresOn && "Expiration date unknown."}</p>}
      </section>
      {canWrite && <button className="rounded bg-cream-100 px-5 py-3 font-semibold text-charcoal-900 disabled:opacity-50" type="submit">{pending ? "Saving…" : mode === "create" ? "Create volunteer" : "Save changes"}</button>}
    </fieldset>
    <p role="status" aria-live="polite">{pending ? "Saving volunteer information…" : ""}</p>
  </form>;
}
