'use client'

import { cloneElement, useId, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarCheck2, Check, CircleMinus, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import type { TrainingCourse, TrainingCourseEnrollment, TrainingCourseSession } from '@/types'

type Attendance = { id: string; session_id: string; enrollment_id: string; status: 'present' | 'absent' | 'excused' | 'make_up'; make_up_for_session_id: string | null }

export default function CourseAttendanceManager({ course, sessions, enrollments, initialAttendance, permissions }: { course: TrainingCourse; sessions: TrainingCourseSession[]; enrollments: TrainingCourseEnrollment[]; initialAttendance: Attendance[]; permissions: { offer: boolean; schedule: boolean; attendance: boolean; customers: boolean; passes: boolean } }) {
  const [attendance, setAttendance] = useState(initialAttendance)
  const [activeSessionId, setActiveSessionId] = useState(sessions.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]?.id ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [settings, setSettings] = useState({ name: course.name, description: course.description ?? '', location: course.location ?? '', capacity: String(course.capacity), price: String(course.price), enrollmentMode: course.enrollment_mode, makeUpLimit: String(course.make_up_limit) })
  const [newSessionAt, setNewSessionAt] = useState('')
  const [consumePass, setConsumePass] = useState(false)
  const consumePassId = useId()
  const activeEnrollments = enrollments.filter(value => ['confirmed', 'completed'].includes(value.status))
  const activeSession = sessions.find(value => value.id === activeSessionId)

  async function request(payload: Record<string, unknown>) {
    const response = await fetch(`/api/training-courses/${course.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? 'Operacja nie powiodła się')
    return data
  }

  async function setStatus(enrollmentId: string, status: Attendance['status']) {
    const originalAbsence = status === 'make_up'
      ? attendance.find(item => item.enrollment_id === enrollmentId && item.session_id !== activeSessionId && (item.status === 'absent' || item.status === 'excused'))
      : null
    if (status === 'make_up' && !originalAbsence) { setMessage('Najpierw oznacz wcześniejszą nieobecność lub usprawiedliwienie tego psa.'); return }
    try {
      const data = await request({ action: 'attendance', sessionId: activeSessionId, enrollmentId, status, makeUpForSessionId: originalAbsence?.session_id, consumePass })
      setAttendance(current => [...current.filter(item => !(item.session_id === activeSessionId && item.enrollment_id === enrollmentId)), data])
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się zapisać obecności') }
  }

  async function enrollmentAction(enrollment: TrainingCourseEnrollment, manualPayment = false) {
    try { await request({ action: manualPayment ? 'approve_enrollment_manual' : 'approve_enrollment', enrollmentId: enrollment.id }); window.location.reload() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się zmienić zapisu') }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    try {
      await request({ name: settings.name, description: settings.description, location: settings.location, capacity: Number(settings.capacity), price: Number(settings.price), enrollmentMode: settings.enrollmentMode, makeUpLimit: Number(settings.makeUpLimit) })
      setMessage('Ustawienia kursu zapisane.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się zapisać kursu') }
  }

  async function addSession() {
    const startsAt = new Date(newSessionAt)
    if (Number.isNaN(startsAt.getTime())) { setMessage('Wybierz termin zajęć.'); return }
    try { await request({ action: 'session', operation: 'add', startsAt: startsAt.toISOString(), durationMin: sessions[0]?.duration_min ?? 60 }); window.location.reload() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się dodać terminu') }
  }

  async function cancelSession(session: TrainingCourseSession) {
    if (!window.confirm(`Anulować zajęcia ${new Date(session.starts_at).toLocaleString('pl-PL')}?`)) return
    try { await request({ action: 'session', operation: 'cancel', sessionId: session.id, reason: 'Termin anulowany przez trenera' }); window.location.reload() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się anulować terminu') }
  }

  async function editSession(session: TrainingCourseSession) {
    const localValue = new Date(new Date(session.starts_at).getTime() - new Date(session.starts_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    const startsAt = window.prompt('Nowy termin (RRRR-MM-DDTHH:mm)', localValue)
    if (!startsAt) return
    try { await request({ action: 'session', operation: 'update', sessionId: session.id, startsAt: new Date(startsAt).toISOString(), durationMin: session.duration_min }); window.location.reload() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się zmienić terminu') }
  }

  async function cancelEnrollment(enrollment: TrainingCourseEnrollment) {
    if (!window.confirm('Anulować zapis? Opłacona płatność zostanie zwrócona przez Stripe.')) return
    try { await request({ action: 'cancel_enrollment', enrollmentId: enrollment.id, reason: 'Anulowanie przez trenera' }); window.location.reload() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się anulować zapisu') }
  }

  async function cancelCourse() {
    if (!window.confirm('Anulować cały kurs? Wszystkie możliwe płatności zostaną zwrócone.')) return
    try {
      const data = await request({ action: 'cancel_course', reason: 'Kurs anulowany przez trenera' })
      setMessage(data.refundFailures?.length ? `Kurs anulowany. ${data.refundFailures.length} zwrotów wymaga uwagi.` : 'Kurs anulowany i zwroty zlecone.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się anulować kursu') }
  }

  return <div className="space-y-6">
    <Link href="/trainer/groups" className="inline-flex items-center gap-2 text-sm text-accent"><ArrowLeft className="h-4 w-4" /> Grupy i karnety</Link>
    <div><p className="text-xs font-semibold uppercase tracking-widest text-accent">Zarządzanie kursem</p><h1 className="page-title mb-1">{course.name}</h1><p className="text-muted-foreground">{activeEnrollments.length} osób w stałej grupie · limit {course.capacity}</p></div>
    {message && <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-sm">{message}</p>}

    {permissions.offer && <form className="card space-y-4" onSubmit={saveSettings}><h2 className="font-heading text-lg font-semibold">Ustawienia kursu</h2><div className="grid gap-3 md:grid-cols-2"><Field label="Nazwa"><input className="form-input" value={settings.name} onChange={event => setSettings(value => ({ ...value, name: event.target.value }))} /></Field><Field label="Miejsce"><input className="form-input" value={settings.location} onChange={event => setSettings(value => ({ ...value, location: event.target.value }))} /></Field><Field label="Limit grupy"><input type="number" min="1" max="100" className="form-input" value={settings.capacity} onChange={event => setSettings(value => ({ ...value, capacity: event.target.value }))} /></Field><Field label="Cena kursu"><input type="number" min="0" step="0.01" className="form-input" value={settings.price} onChange={event => setSettings(value => ({ ...value, price: event.target.value }))} /></Field><Field label="Tryb zapisów"><select className="form-input" value={settings.enrollmentMode} onChange={event => setSettings(value => ({ ...value, enrollmentMode: event.target.value as 'open' | 'approval' }))}><option value="open">Otwarte</option><option value="approval">Akceptacja trenera</option></select></Field><Field label="Limit odrabiania"><input type="number" min="0" max="20" className="form-input" value={settings.makeUpLimit} onChange={event => setSettings(value => ({ ...value, makeUpLimit: event.target.value }))} /></Field></div><Field label="Opis"><textarea className="form-input" value={settings.description} onChange={event => setSettings(value => ({ ...value, description: event.target.value }))} /></Field><div className="flex flex-wrap gap-2"><button className="btn btn-primary btn-sm"><Save className="h-4 w-4" /> Zapisz</button>{course.status !== 'cancelled' && <button type="button" className="btn btn-secondary btn-sm text-red-700" onClick={cancelCourse}><Trash2 className="h-4 w-4" /> Anuluj cały kurs</button>}</div></form>}

    <section className="card"><h2 className="mb-3 font-heading text-lg font-semibold">Harmonogram</h2>{permissions.schedule && <div className="mb-4 flex flex-wrap gap-2"><input type="datetime-local" className="form-input flex-1" value={newSessionAt} onChange={event => setNewSessionAt(event.target.value)} /><button className="btn btn-secondary btn-sm" onClick={addSession}><Plus className="h-4 w-4" /> Dodaj termin</button></div>}<div className="space-y-2">{sessions.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map(session => <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2 text-sm"><span>{new Date(session.starts_at).toLocaleString('pl-PL')} · {session.duration_min} min · {session.status}</span>{permissions.schedule && session.status === 'scheduled' && <span className="flex gap-2"><button className="btn btn-secondary btn-sm" onClick={() => editSession(session)}>Zmień</button><button className="btn btn-secondary btn-sm text-red-700" onClick={() => cancelSession(session)}>Anuluj</button></span>}</div>)}</div></section>

    {permissions.customers && enrollments.some(value => value.status === 'pending' || value.status === 'waitlisted') && <section className="card"><h2 className="mb-4 font-heading text-lg font-semibold">Zapisy do rozpatrzenia</h2><div className="space-y-2">{enrollments.filter(value => value.status === 'pending' || value.status === 'waitlisted').map(value => <div key={value.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2"><div><p className="font-semibold">{value.dogs?.name ?? 'Pies'}</p><p className="text-xs text-muted-foreground">{value.status === 'waitlisted' ? `Lista rezerwowa: ${value.waitlist_position}` : value.approved_at ? 'Czeka na płatność online' : 'Oczekuje na decyzję'}</p></div><div className="flex flex-wrap gap-2">{!value.approved_at && <><button className="btn btn-primary btn-sm" onClick={() => enrollmentAction(value)}><Check className="h-4 w-4" /> Przyjmij — Stripe</button>{Number(course.price) > 0 && <button className="btn btn-secondary btn-sm" onClick={() => enrollmentAction(value, true)}>Płatność ręczna</button>}</>}<button className="btn btn-secondary btn-sm text-red-700" onClick={() => cancelEnrollment(value)}>Anuluj</button></div></div>)}</div></section>}

    {permissions.attendance && <section className="card"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><CalendarCheck2 className="h-5 w-5 text-accent" /> Spotkanie</h2>{activeSession && <p className="mt-1 text-sm text-muted-foreground">{new Date(activeSession.starts_at).toLocaleString('pl-PL')}</p>}{permissions.passes && <label htmlFor={consumePassId} className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><input id={consumePassId} type="checkbox" checked={consumePass} onChange={event => setConsumePass(event.target.checked)} /> Przy oznaczeniu obecności pobierz wejście z pasującego karnetu</label>}</div><select className="form-input w-auto" value={activeSessionId} onChange={event => setActiveSessionId(event.target.value)}>{sessions.filter(session => session.status !== 'cancelled').slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((session, index) => <option key={session.id} value={session.id}>#{index + 1} · {new Date(session.starts_at).toLocaleString('pl-PL')}</option>)}</select></div>
      <div className="space-y-2">{activeEnrollments.map(enrollment => { const saved = attendance.find(item => item.session_id === activeSessionId && item.enrollment_id === enrollment.id); const current = saved?.status ?? null; return <div key={enrollment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"><p className="font-semibold">{enrollment.dogs?.name ?? 'Pies'}</p><div className="flex flex-wrap gap-1"><AttendanceButton active={current === 'present'} onClick={() => setStatus(enrollment.id, 'present')}><Check className="h-3.5 w-3.5" /> Obecny</AttendanceButton><AttendanceButton active={current === 'absent'} onClick={() => setStatus(enrollment.id, 'absent')}><CircleMinus className="h-3.5 w-3.5" /> Nieobecny</AttendanceButton><AttendanceButton active={current === 'excused'} onClick={() => setStatus(enrollment.id, 'excused')}><CircleMinus className="h-3.5 w-3.5" /> Usprawiedliwiony</AttendanceButton><AttendanceButton active={current === 'make_up'} onClick={() => setStatus(enrollment.id, 'make_up')}><RotateCcw className="h-3.5 w-3.5" /> Odrabia</AttendanceButton>{permissions.customers && <button className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700" onClick={() => cancelEnrollment(enrollment)}>Anuluj zapis</button>}</div></div> })}</div>
    </section>}
  </div>
}

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) { const id = useId(); return <label htmlFor={id} className="block"><span className="form-label">{label}</span>{cloneElement(children, { id })}</label> }
function AttendanceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${active ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'}`}>{children}</button> }
