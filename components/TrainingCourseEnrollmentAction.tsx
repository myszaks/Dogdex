'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import useUser from '@/hooks/useUser'
import type { Dog, TrainingCourse } from '@/types'

export default function TrainingCourseEnrollmentAction({ course }: { course: TrainingCourse }) {
  const { user } = useUser()
  const [dogs, setDogs] = useState<Dog[]>([])
  const [dogId, setDogId] = useState('')
  const [notes, setNotes] = useState('')
  const [accepted, setAccepted] = useState(!course.cancellation_policy)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    fetch('/api/dogs').then(response => response.json()).then(data => {
      if (!Array.isArray(data)) return
      setDogs(data)
      setDogId(data[0]?.id ?? '')
    }).catch(() => {})
  }, [user])

  async function enroll() {
    if (!user || !dogId) { setMessage('Zaloguj się i wybierz psa z profilu.'); return }
    if (!accepted) { setMessage('Zaakceptuj zasady rezygnacji przed zapisem.'); return }
    setLoading(true); setMessage(null)
    const response = await fetch(`/api/training-courses/${course.id}/enroll`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dogId, notes, policyAccepted: accepted }),
    })
    const data = await response.json(); setLoading(false)
    if (response.ok && data.checkoutUrl) { window.location.assign(data.checkoutUrl); return }
    setMessage(response.ok
      ? data.status === 'waitlisted' ? `Dodano do listy rezerwowej — pozycja ${data.waitlist_position}.`
        : data.status === 'confirmed' ? 'Miejsce w grupie jest potwierdzone.' : 'Zgłoszenie czeka na akceptację trenera.'
      : data.error ?? 'Nie udało się zapisać')
  }

  return <div className="card space-y-4">
    <h2 className="font-heading text-xl font-semibold">Zapisz psa</h2>
    {!user && <p className="text-sm text-muted-foreground">Zaloguj się, aby wybrać psa i wysłać zapis.</p>}
    {user && dogs.length === 0 && <p className="text-sm text-muted-foreground">Najpierw dodaj psa do swojego profilu.</p>}
    {dogs.length > 0 && <label htmlFor="course-enrollment-dog" className="block"><span className="form-label">Pies</span><select id="course-enrollment-dog" className="form-input" value={dogId} onChange={event => setDogId(event.target.value)}>{dogs.map(dog => <option key={dog.id} value={dog.id}>{dog.name}</option>)}</select></label>}
    <label htmlFor="course-enrollment-notes" className="block"><span className="form-label">Informacje dla trenera (opcjonalnie)</span><textarea id="course-enrollment-notes" className="form-input" rows={3} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
    {course.cancellation_policy && <label htmlFor="course-enrollment-policy" className="flex items-start gap-2 text-sm"><input id="course-enrollment-policy" type="checkbox" className="mt-1" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Zapoznałem/am się z zasadami rezygnacji i zwrotów.</span></label>}
    {message && <p role="status" className="rounded-xl bg-secondary px-3 py-2 text-sm">{message}</p>}
    <button className="btn btn-primary w-full" disabled={loading || !dogId || !accepted} onClick={enroll}>{loading && <Loader2 className="h-4 w-4 animate-spin" />} {Number(course.price) > 0 && course.enrollment_mode === 'open' ? 'Zapisz i zapłać' : 'Wyślij zapis'}</button>
  </div>
}
