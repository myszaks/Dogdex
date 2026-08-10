'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, CreditCard, Loader2, UsersRound } from 'lucide-react'
import useUser from '@/hooks/useUser'
import type { Dog, TrainingCourse, TrainingPassProduct } from '@/types'

export default function TrainingGroupOffers({ courses, passProducts, trainerSlug }: {
  courses: TrainingCourse[]
  passProducts: TrainingPassProduct[]
  trainerSlug?: string
}) {
  const { user } = useUser()
  const [dogs, setDogs] = useState<Dog[]>([])
  const [dogId, setDogId] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [acceptedPolicies, setAcceptedPolicies] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!user) return
    fetch('/api/dogs').then(response => response.json()).then(data => {
      if (!Array.isArray(data)) return
      setDogs(data)
      setDogId(current => current || data[0]?.id || '')
    }).catch(() => {})
  }, [user])

  async function enroll(course: TrainingCourse) {
    if (!user || !dogId) { setMessage('Zaloguj się i wybierz psa z profilu.'); return }
    if (course.cancellation_policy && !acceptedPolicies[`course-${course.id}`]) { setMessage('Zaakceptuj zasady rezygnacji przed zapisem.'); return }
    setLoading(course.id); setMessage(null)
    const response = await fetch(`/api/training-courses/${course.id}/enroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dogId, policyAccepted: !course.cancellation_policy || acceptedPolicies[`course-${course.id}`] === true }) })
    const data = await response.json(); setLoading(null)
    if (response.ok && data.checkoutUrl) { window.location.assign(data.checkoutUrl); return }
    setMessage(response.ok ? data.status === 'waitlisted' ? `Dodano do listy rezerwowej — pozycja ${data.waitlist_position}.` : data.status === 'confirmed' ? 'Miejsce w grupie jest potwierdzone.' : 'Zgłoszenie czeka na akceptację trenera.' : data.error ?? 'Nie udało się zapisać')
  }

  async function purchase(product: TrainingPassProduct) {
    if (!user || !dogId) { setMessage('Zaloguj się i wybierz psa z profilu.'); return }
    if ((product.cancellation_policy || product.freeze_policy) && !acceptedPolicies[`pass-${product.id}`]) { setMessage('Zaakceptuj zasady karnetu przed zakupem.'); return }
    setLoading(product.id); setMessage(null)
    const response = await fetch('/api/training-passes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'purchase', productId: product.id, dogId, policyAccepted: !(product.cancellation_policy || product.freeze_policy) || acceptedPolicies[`pass-${product.id}`] === true }) })
    const data = await response.json(); setLoading(null)
    if (response.ok && data.checkoutUrl) { window.location.assign(data.checkoutUrl); return }
    setMessage(response.ok ? 'Karnet jest aktywny.' : data.error ?? 'Nie udało się zamówić karnetu')
  }

  if (courses.length === 0 && passProducts.length === 0) return null
  return <section className="mb-10 space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-accent">Zajęcia grupowe</p><h2 className="font-heading text-2xl font-semibold">Kursy i karnety</h2></div>{user && dogs.length > 0 && <label htmlFor="training-group-dog"><span className="form-label">Pies</span><select id="training-group-dog" className="form-input min-w-48" value={dogId} onChange={event => setDogId(event.target.value)}>{dogs.map(dog => <option key={dog.id} value={dog.id}>{dog.name}</option>)}</select></label>}</div>
    {message && <p role="status" className="rounded-xl border border-border bg-white px-4 py-3 text-sm">{message}</p>}
    {courses.length > 0 && <div className="grid gap-4 md:grid-cols-2">{courses.map(course => {
      const sessions = course.training_course_sessions?.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)) ?? []
      const policyKey = `course-${course.id}`
      return <article key={course.id} className="card"><div className="flex items-start gap-3"><UsersRound className="mt-1 h-5 w-5 text-accent" /><div><h3 className="font-heading text-lg font-semibold">{course.name}</h3>{course.description && <p className="mt-1 text-sm text-muted-foreground">{course.description}</p>}</div></div><div className="mt-4 space-y-1 text-sm text-muted-foreground"><p><CalendarDays className="mr-1 inline h-4 w-4" />{sessions.length} spotkań{sessions[0] ? ` · od ${new Date(sessions[0].starts_at).toLocaleDateString('pl-PL')}` : ''}</p><p>Limit {course.capacity} psów · {Number(course.price) > 0 ? Number(course.price).toLocaleString('pl-PL', { style: 'currency', currency: course.currency }) : 'bezpłatnie'}</p></div>
        {course.cancellation_policy && <PolicyDetails title="Zasady rezygnacji i zwrotów" accepted={Boolean(acceptedPolicies[policyKey])} onChange={accepted => setAcceptedPolicies(current => ({ ...current, [policyKey]: accepted }))}><p>{course.cancellation_policy}</p></PolicyDetails>}
        <div className="mt-4 flex gap-2">{trainerSlug && <Link href={`/trainings/${trainerSlug}/courses/${course.slug}`} className="btn btn-secondary btn-sm flex-1">Szczegóły</Link>}<button className="btn btn-primary btn-sm flex-1" disabled={loading === course.id || Boolean(course.cancellation_policy && !acceptedPolicies[policyKey])} onClick={() => enroll(course)}>{loading === course.id && <Loader2 className="h-4 w-4 animate-spin" />} {Number(course.price) > 0 && course.enrollment_mode === 'open' ? 'Zapisz i zapłać' : 'Zapisz psa'}</button></div>
      </article>
    })}</div>}
    {passProducts.length > 0 && <div><h3 className="mb-3 font-heading text-lg font-semibold">Karnety wejściowe</h3><div className="grid gap-4 md:grid-cols-3">{passProducts.map(product => {
      const policyKey = `pass-${product.id}`
      const hasPolicy = Boolean(product.cancellation_policy || product.freeze_policy)
      return <article key={product.id} className="card"><CreditCard className="h-5 w-5 text-accent" /><h4 className="mt-2 font-semibold">{product.name}</h4><p className="mt-1 text-sm text-muted-foreground">{product.entries} wejść · ważny {product.validity_days} dni</p><p className="mt-3 font-heading text-xl font-bold">{Number(product.price) > 0 ? Number(product.price).toLocaleString('pl-PL', { style: 'currency', currency: product.currency }) : 'Bezpłatnie'}</p>
        {hasPolicy && <PolicyDetails title="Zasady karnetu" accepted={Boolean(acceptedPolicies[policyKey])} onChange={accepted => setAcceptedPolicies(current => ({ ...current, [policyKey]: accepted }))}>{product.cancellation_policy && <p><strong>Rezygnacja:</strong> {product.cancellation_policy}</p>}{product.freeze_policy && <p><strong>Zamrożenie:</strong> {product.freeze_policy}</p>}</PolicyDetails>}
        <button className="btn btn-secondary btn-sm mt-4 w-full" disabled={loading === product.id || Boolean(hasPolicy && !acceptedPolicies[policyKey])} onClick={() => purchase(product)}>{loading === product.id && <Loader2 className="h-4 w-4 animate-spin" />} {Number(product.price) > 0 ? 'Kup i zapłać' : 'Odbierz karnet'}</button>
      </article>
    })}</div></div>}
  </section>
}

function PolicyDetails({ title, accepted, onChange, children }: { title: string; accepted: boolean; onChange: (accepted: boolean) => void; children: React.ReactNode }) {
  const id = useId()
  return <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-accent">{title}</summary><div className="mt-2 space-y-2 whitespace-pre-wrap text-muted-foreground">{children}</div><label htmlFor={id} className="mt-2 flex items-start gap-2"><input id={id} type="checkbox" className="mt-1" checked={accepted} onChange={event => onChange(event.target.checked)} /> Akceptuję zasady</label></details>
}
