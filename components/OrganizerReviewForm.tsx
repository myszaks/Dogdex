'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Star, Trash2 } from 'lucide-react'
import useUser from '@/hooks/useUser'
import type { EventReview } from '@/types'

interface Props {
  eventId: string
  organizerId: string
}

export default function OrganizerReviewForm({ eventId, organizerId }: Props) {
  const { loading: authLoading, user } = useUser()
  const [eligible, setEligible] = useState(false)
  const [review, setReview] = useState<EventReview | null>(null)
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user) return
    const controller = new AbortController()
    fetch(`/api/event-reviews?event_id=${encodeURIComponent(eventId)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) return null
        return response.json()
      })
      .then(data => {
        if (!data) return
        setEligible(Boolean(data.eligible))
        setReview(data.review ?? null)
        setEditing(Boolean(data.eligible && !data.review))
        if (data.review) {
          setRating(data.review.rating)
          setComment(data.review.comment ?? '')
        }
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [authLoading, eventId, user])

  if (!user || !eligible) return null

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(review ? `/api/event-reviews/${review.id}` : '/api/event-reviews', {
        method: review ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, rating, comment }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nie udało się zapisać opinii')
      setReview(data)
      setEditing(false)
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!review || !confirm('Czy na pewno chcesz usunąć tę opinię?')) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/event-reviews/${review.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nie udało się usunąć opinii')
      setReview(null)
      setRating(5)
      setComment('')
      setEditing(true)
    } catch (removeError) {
      setError((removeError as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-heading font-semibold text-foreground">Oceń organizatora</p>
          <Link href={`/organizers/${organizerId}`} className="mt-1 inline-block text-xs text-accent hover:underline">
            Zobacz profil publiczny
          </Link>
        </div>
        {review && !editing && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setEditing(true)} className="text-sm text-accent hover:underline">Edytuj</button>
            <button type="button" onClick={remove} disabled={saving} className="text-red-600" aria-label="Usuń opinię">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {review && !editing ? (
        <>
          <Stars rating={review.rating} interactive={false} onChange={() => undefined} />
          {review.comment && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{review.comment}</p>}
        </>
      ) : (
        <div className="mt-4 space-y-3">
          <Stars rating={rating} interactive onChange={setRating} />
          <textarea
            value={comment}
            onChange={event => setComment(event.target.value)}
            maxLength={2000}
            rows={3}
            className="form-input resize-none"
            placeholder="Napisz, jak oceniasz organizację wydarzenia (opcjonalnie)"
          />
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">
              {saving ? 'Zapisywanie…' : 'Zapisz opinię'}
            </button>
            {review && (
              <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary btn-sm">Anuluj</button>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function Stars({
  interactive,
  onChange,
  rating,
}: {
  interactive: boolean
  onChange: (rating: number) => void
  rating: number
}) {
  return (
    <div className="mt-3 flex gap-1" aria-label={`Ocena ${rating} na 5`}>
      {Array.from({ length: 5 }, (_, index) => {
        const value = index + 1
        const icon = <Star className={`h-6 w-6 ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
        return interactive ? (
          <button key={value} type="button" onClick={() => onChange(value)} aria-label={`${value} z 5 gwiazdek`}>
            {icon}
          </button>
        ) : <span key={value}>{icon}</span>
      })}
    </div>
  )
}
