'use client'

import { cloneElement, useId, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { BookOpenCheck, CalendarPlus, Check, CreditCard, Loader2, Plus, UsersRound } from 'lucide-react'
import type { TrainingCourse, TrainingPass, TrainingPassProduct, TrainingType } from '@/types'
import { buildRecurringSessionStarts } from '@/lib/trainingGroups'

export default function TrainingGroupsManager({ initialCourses, trainingTypes, initialProducts, initialPasses, ownerDogs = {}, permissions }: {
  initialCourses: TrainingCourse[]
  trainingTypes: TrainingType[]
  initialProducts: TrainingPassProduct[]
  initialPasses: TrainingPass[]
  ownerDogs?: Record<string, Array<{ id: string; name: string }>>
  permissions: { offer: boolean; schedule: boolean; attendance: boolean; customers: boolean; passes: boolean; payments: boolean; refunds: boolean }
}) {
  const [courses, setCourses] = useState(initialCourses)
  const [products, setProducts] = useState(initialProducts)
  const [passes, setPasses] = useState(initialPasses)
  const [tab, setTab] = useState<'courses' | 'passes'>(permissions.offer || permissions.schedule || permissions.attendance || permissions.customers ? 'courses' : 'passes')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [course, setCourse] = useState({ name: '', description: '', location: '', cancellationPolicy: '', participantMessage: '', trainingTypeId: '', capacity: '8', price: '0', enrollmentMode: 'open', makeUpLimit: '1', startAt: '', sessionCount: '6', intervalDays: '7', durationMin: '60' })
  const [product, setProduct] = useState({ name: '', description: '', cancellationPolicy: '', freezePolicy: '', trainingTypeId: '', entries: '5', validityDays: '90', price: '0' })

  async function createCourse(event: React.FormEvent) {
    event.preventDefault()
    const start = new Date(course.startAt)
    if (Number.isNaN(start.getTime())) { setMessage('Wybierz termin pierwszych zajęć.'); return }
    const count = Math.max(1, Math.min(100, Number(course.sessionCount)))
    const interval = Math.max(1, Number(course.intervalDays))
    const sessionStarts = buildRecurringSessionStarts(start, count, interval)
    setSaving(true); setMessage(null)
    try {
      const response = await fetch('/api/training-courses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        name: course.name, description: course.description, location: course.location, cancellationPolicy: course.cancellationPolicy,
        participantMessage: course.participantMessage, trainingTypeId: course.trainingTypeId || null,
        capacity: Number(course.capacity), price: Number(course.price), enrollmentMode: course.enrollmentMode,
        makeUpLimit: Number(course.makeUpLimit), durationMin: Number(course.durationMin), sessionStarts,
      }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Nie udało się utworzyć kursu')
      setCourses(current => [data, ...current])
      setCourse({ name: '', description: '', location: '', cancellationPolicy: '', participantMessage: '', trainingTypeId: '', capacity: '8', price: '0', enrollmentMode: 'open', makeUpLimit: '1', startAt: '', sessionCount: '6', intervalDays: '7', durationMin: '60' })
      setMessage('Kurs został utworzony jako szkic.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Błąd zapisu') } finally { setSaving(false) }
  }

  async function publishCourse(value: TrainingCourse) {
    const response = await fetch(`/api/training-courses/${value.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: value.status === 'published' ? 'archived' : 'published' }) })
    const data = await response.json()
    if (!response.ok) { setMessage(data.error ?? 'Nie udało się zmienić statusu'); return }
    setCourses(current => current.map(item => item.id === value.id ? { ...item, status: data.status } : item))
  }

  async function editCourseCommunication(value: TrainingCourse) {
    const cancellationPolicy = window.prompt('Zasady rezygnacji i zwrotów widoczne przed zakupem', value.cancellation_policy ?? '')
    if (cancellationPolicy === null) return
    const participantMessage = window.prompt('Bieżący komunikat dla uczestników (opcjonalnie)', value.participant_message ?? '')
    if (participantMessage === null) return
    const response = await fetch(`/api/training-courses/${value.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cancellationPolicy, participantMessage }) })
    const data = await response.json()
    if (!response.ok) setMessage(data.error ?? 'Nie udało się zapisać zasad kursu')
    else setCourses(current => current.map(item => item.id === value.id ? { ...item, ...data } : item))
  }

  async function createProduct(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null)
    try {
      const response = await fetch('/api/training-passes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create_product', name: product.name, description: product.description, cancellationPolicy: product.cancellationPolicy, freezePolicy: product.freezePolicy, trainingTypeId: product.trainingTypeId || null, entries: Number(product.entries), validityDays: Number(product.validityDays), price: Number(product.price) }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Nie udało się utworzyć karnetu')
      setProducts(current => [data, ...current]); setProduct({ name: '', description: '', cancellationPolicy: '', freezePolicy: '', trainingTypeId: '', entries: '5', validityDays: '90', price: '0' }); setMessage('Oferta karnetu jest aktywna.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Błąd zapisu') } finally { setSaving(false) }
  }

  async function passAction(pass: TrainingPass, action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch('/api/training-passes', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passId: pass.id, action, ...extra }) })
    const data = await response.json()
    if (!response.ok) { setMessage(data.error ?? 'Nie udało się zmienić karnetu'); return }
    setPasses(current => current.map(item => item.id === pass.id ? { ...item, ...data } : item))
  }

  async function reconcilePayments() {
    setSaving(true); setMessage(null)
    const response = await fetch('/api/training-commerce/reconcile', { method: 'POST' })
    const data = await response.json(); setSaving(false)
    setMessage(response.ok ? `Sprawdzono ${data.checked} płatności, poprawiono ${data.corrected}.` : data.error ?? 'Nie udało się uzgodnić płatności')
  }

  async function toggleProduct(value: TrainingPassProduct) {
    const response = await fetch('/api/training-passes', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle_product', productId: value.id }) })
    const data = await response.json()
    if (!response.ok) setMessage(data.error ?? 'Nie udało się zmienić oferty')
    else setProducts(current => current.map(item => item.id === value.id ? data : item))
  }

  async function editProduct(value: TrainingPassProduct) {
    const name = window.prompt('Nazwa oferty', value.name)
    if (!name) return
    const validityDays = window.prompt('Ważność w dniach', String(value.validity_days))
    if (!validityDays) return
    const entries = window.prompt('Liczba wejść', String(value.entries))
    if (!entries) return
    const cancellationPolicy = window.prompt('Zasady rezygnacji i zwrotów', value.cancellation_policy ?? '')
    if (cancellationPolicy === null) return
    const freezePolicy = window.prompt('Zasady zamrażania i przedłużania', value.freeze_policy ?? '')
    if (freezePolicy === null) return
    const response = await fetch('/api/training-passes', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update_product', productId: value.id, name, description: value.description ?? '', cancellationPolicy, freezePolicy, validityDays: Number(validityDays), entries: Number(entries) }) })
    const data = await response.json()
    if (!response.ok) setMessage(data.error ?? 'Nie udało się zmienić oferty')
    else setProducts(current => current.map(item => item.id === value.id ? data : item))
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="page-title mb-1">Grupy, kursy i karnety</h1><p className="text-muted-foreground">Cykliczne zajęcia, stałe grupy, obecności i kontrola wejść.</p></div>{permissions.payments && <div className="flex gap-2"><a className="btn btn-secondary btn-sm" href="/api/training-commerce/export">Eksport CSV</a><button className="btn btn-secondary btn-sm" disabled={saving} onClick={reconcilePayments}>Uzgodnij ze Stripe</button></div>}</div>
      <div className="flex gap-2">{(permissions.offer || permissions.schedule || permissions.attendance || permissions.customers) && <button className={`btn ${tab === 'courses' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('courses')}><UsersRound className="h-4 w-4" /> Kursy i grupy</button>}{permissions.passes && <button className={`btn ${tab === 'passes' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('passes')}><CreditCard className="h-4 w-4" /> Karnety</button>}</div>
      {message && <p role="status" className="rounded-2xl border border-border bg-white px-4 py-3 text-sm">{message}</p>}
      {tab === 'courses' ? <>
        {permissions.offer && <form onSubmit={createCourse} className="card space-y-4"><h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><CalendarPlus className="h-5 w-5 text-accent" /> Nowy kurs cykliczny</h2>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Nazwa"><input className="form-input" required value={course.name} onChange={e => setCourse(v => ({ ...v, name: e.target.value }))} /></Field><Field label="Rodzaj treningu"><select className="form-input" value={course.trainingTypeId} onChange={e => setCourse(v => ({ ...v, trainingTypeId: e.target.value }))}><option value="">Dowolny / ogólny</option>{trainingTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field><Field label="Miejsce"><input className="form-input" value={course.location} onChange={e => setCourse(v => ({ ...v, location: e.target.value }))} /></Field><Field label="Pierwsze zajęcia"><input type="datetime-local" className="form-input" required value={course.startAt} onChange={e => setCourse(v => ({ ...v, startAt: e.target.value }))} /></Field><Field label="Liczba spotkań"><input type="number" min="1" max="100" className="form-input" value={course.sessionCount} onChange={e => setCourse(v => ({ ...v, sessionCount: e.target.value }))} /></Field><Field label="Co ile dni"><input type="number" min="1" className="form-input" value={course.intervalDays} onChange={e => setCourse(v => ({ ...v, intervalDays: e.target.value }))} /></Field><Field label="Limit grupy"><input type="number" min="1" max="100" className="form-input" value={course.capacity} onChange={e => setCourse(v => ({ ...v, capacity: e.target.value }))} /></Field><Field label="Cena całego kursu"><input type="number" min="0" step="0.01" className="form-input" value={course.price} onChange={e => setCourse(v => ({ ...v, price: e.target.value }))} /></Field></div>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Tryb zapisów"><select className="form-input" value={course.enrollmentMode} onChange={e => setCourse(v => ({ ...v, enrollmentMode: e.target.value }))}><option value="open">Otwarte — od razu płatność</option><option value="approval">Akceptacja trenera przed płatnością</option></select></Field><Field label="Limit odrabiania"><input type="number" min="0" max="20" className="form-input" value={course.makeUpLimit} onChange={e => setCourse(v => ({ ...v, makeUpLimit: e.target.value }))} /></Field></div>
          <Field label="Opis"><textarea className="form-input" rows={3} value={course.description} onChange={e => setCourse(v => ({ ...v, description: e.target.value }))} /></Field><Field label="Zasady rezygnacji i zwrotów"><textarea className="form-input" rows={3} value={course.cancellationPolicy} onChange={e => setCourse(v => ({ ...v, cancellationPolicy: e.target.value }))} /></Field><Field label="Komunikat dla uczestników"><textarea className="form-input" rows={2} value={course.participantMessage} onChange={e => setCourse(v => ({ ...v, participantMessage: e.target.value }))} /></Field><button className="btn btn-primary" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Utwórz szkic kursu</button>
        </form>}
        <div className="grid gap-4 md:grid-cols-2">{courses.map(value => <article key={value.id} className="card"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-accent">{value.status}</p><h3 className="font-heading text-lg font-semibold">{value.name}</h3></div>{(permissions.customers || permissions.attendance) && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs">{value.training_course_enrollments?.filter(item => item.status !== 'cancelled').length ?? 0}/{value.capacity}</span>}</div><p className="mt-3 text-sm text-muted-foreground">{value.training_course_sessions?.length ?? 0} spotkań · {Number(value.price).toLocaleString('pl-PL', { style: 'currency', currency: value.currency })}</p><div className="mt-4 flex flex-wrap gap-2"><Link href={`/trainer/groups/${value.id}`} className="btn btn-secondary btn-sm flex-1"><BookOpenCheck className="h-4 w-4" /> Zarządzaj</Link>{permissions.offer && <button className="btn btn-secondary btn-sm" onClick={() => editCourseCommunication(value)}>Zasady i komunikat</button>}{permissions.offer && <button className="btn btn-primary btn-sm" onClick={() => publishCourse(value)}>{value.status === 'published' ? 'Archiwizuj' : 'Opublikuj'}</button>}</div></article>)}</div>
      </> : <>
        <form onSubmit={createProduct} className="card space-y-4"><h2 className="font-heading text-xl font-semibold">Nowa oferta karnetu</h2><div className="grid gap-4 md:grid-cols-2"><Field label="Nazwa"><input className="form-input" required value={product.name} onChange={e => setProduct(v => ({ ...v, name: e.target.value }))} /></Field><Field label="Rodzaj treningu"><select className="form-input" value={product.trainingTypeId} onChange={e => setProduct(v => ({ ...v, trainingTypeId: e.target.value }))}><option value="">Wszystkie treningi</option>{trainingTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field><Field label="Liczba wejść"><input type="number" min="1" max="100" className="form-input" value={product.entries} onChange={e => setProduct(v => ({ ...v, entries: e.target.value }))} /></Field><Field label="Ważność (dni)"><input type="number" min="1" max="730" className="form-input" value={product.validityDays} onChange={e => setProduct(v => ({ ...v, validityDays: e.target.value }))} /></Field><Field label="Cena"><input type="number" min="0" step="0.01" className="form-input" value={product.price} onChange={e => setProduct(v => ({ ...v, price: e.target.value }))} /></Field></div><Field label="Opis"><textarea className="form-input" rows={2} value={product.description} onChange={e => setProduct(v => ({ ...v, description: e.target.value }))} /></Field><Field label="Zasady rezygnacji i zwrotów"><textarea className="form-input" rows={3} value={product.cancellationPolicy} onChange={e => setProduct(v => ({ ...v, cancellationPolicy: e.target.value }))} /></Field><Field label="Zasady zamrażania i przedłużania"><textarea className="form-input" rows={3} value={product.freezePolicy} onChange={e => setProduct(v => ({ ...v, freezePolicy: e.target.value }))} /></Field><button className="btn btn-primary" disabled={saving}><Plus className="h-4 w-4" /> Dodaj karnet</button></form>
        <div className="grid gap-4 md:grid-cols-2">{products.map(value => <article key={value.id} className={`card ${value.is_active ? '' : 'opacity-60'}`}><h3 className="font-semibold">{value.name}</h3><p className="mt-1 text-sm text-muted-foreground">{value.entries} wejść · {value.validity_days} dni · {Number(value.price).toLocaleString('pl-PL', { style: 'currency', currency: value.currency })}</p><div className="mt-3 flex gap-2"><button className="btn btn-secondary btn-sm" onClick={() => editProduct(value)}>Edytuj</button><button className="btn btn-secondary btn-sm" onClick={() => toggleProduct(value)}>{value.is_active ? 'Wyłącz sprzedaż' : 'Włącz sprzedaż'}</button></div></article>)}</div>
        {passes.length > 0 && <section><h2 className="mb-4 font-heading text-xl font-semibold">Wydane karnety</h2><div className="space-y-3">{passes.map(value => { const dogs = ownerDogs[value.user_id] ?? []; const transferId = `transfer-pass-${value.id}`; return <div key={value.id} className="card space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{value.training_pass_products?.name ?? 'Karnet'} · {value.dogs?.name ?? 'Pies'}</p><p className="text-sm text-muted-foreground">Pozostało {value.entries_remaining}/{value.entries_total} · {value.status} · płatność: {value.payment_status}{value.expires_at ? ` · do ${value.expires_at}` : ''}</p></div><div className="flex flex-wrap gap-2">{value.status === 'pending' && value.payment_status === 'unpaid' && <button className="btn btn-primary btn-sm" onClick={() => passAction(value, 'activate')}><Check className="h-4 w-4" /> Płatność ręczna</button>}{value.status === 'active' && <button className="btn btn-secondary btn-sm" onClick={() => passAction(value, 'consume')}>Wykorzystaj wejście</button>}{value.status === 'active' && <button className="btn btn-secondary btn-sm" onClick={() => passAction(value, 'freeze')}>Zamroź</button>}{value.status === 'frozen' && <button className="btn btn-secondary btn-sm" onClick={() => passAction(value, 'unfreeze')}>Wznów</button>}<button className="btn btn-secondary btn-sm" onClick={() => { const days = window.prompt('O ile dni przedłużyć?', '30'); if (days) void passAction(value, 'extend', { days: Number(days) }) }}>Przedłuż</button><button className="btn btn-secondary btn-sm" onClick={() => { const remaining = window.prompt('Nowa liczba pozostałych wejść', String(value.entries_remaining)); if (remaining != null) void passAction(value, 'balance', { entriesRemaining: Number(remaining), note: 'Korekta w panelu trenera' }) }}>Korekta salda</button>{permissions.refunds && value.payment_status === 'paid' && value.entries_remaining === value.entries_total && <button className="btn btn-secondary btn-sm text-red-700" onClick={() => passAction(value, 'refund', { reason: 'Zwrot z panelu trenera' })}>Zwrot Stripe</button>}</div></div>{dogs.length > 1 && <label htmlFor={transferId} className="block text-xs text-muted-foreground">Przenieś na psa<select id={transferId} className="form-input mt-1" value={value.dog_id ?? ''} onChange={event => passAction(value, 'transfer', { dogId: event.target.value })}>{dogs.map(dog => <option key={dog.id} value={dog.id}>{dog.name}</option>)}</select></label>}</div>})}</div></section>}
      </>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId()
  return <label htmlFor={id} className="block"><span className="form-label">{label}</span>{cloneElement(children, { id })}</label>
}
