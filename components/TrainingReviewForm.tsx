'use client'

import { useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import type { TrainingReview } from '@/types'

interface Props {
  bookingId: string
  existing?: TrainingReview
  onChange: (review: TrainingReview | null) => void
}

export default function TrainingReviewForm({ bookingId, existing, onChange }: Props) {
  const [editing, setEditing] = useState(!existing)
  const [rating, setRating] = useState(existing?.rating ?? 5)
  const [comment, setComment] = useState(existing?.comment ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(
        existing ? `/api/training-reviews/${existing.id}` : '/api/training-reviews',
        {
          method: existing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId, rating, comment }),
        },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nie udało się zapisać opinii')
      onChange(data)
      setEditing(false)
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!existing || !confirm('Czy na pewno chcesz usunąć tę opinię?')) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/training-reviews/${existing.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nie udało się usunąć opinii')
      setRating(5)
      setComment('')
      setEditing(true)
      onChange(null)
    } catch (removeError) {
      setError((removeError as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (existing && !editing) {
    return (
      <div className="mt-4 bg-amber-50/60 border border-amber-200 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold mb-1">Twoja opinia</p>
            <div className="flex gap-1" aria-label={`Ocena ${existing.rating} na 5`}>
              {Array.from({ length: 5 }, (_, index) => (
                <Star
                  key={index}
                  className={`w-4 h-4 ${index < existing.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="text-sm text-accent hover:underline">
              Edytuj
            </button>
            <button type="button" onClick={remove} disabled={saving} className="text-red-600" aria-label="Usuń opinię">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {existing.comment && <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{existing.comment}</p>}
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mt-4 border-t pt-4">
      <p className="text-sm font-semibold mb-2">{existing ? 'Edytuj opinię' : 'Oceń ten trening'}</p>
      <div className="flex gap-1 mb-3">
        {Array.from({ length: 5 }, (_, index) => {
          const value = index + 1
          return (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} z 5 gwiazdek`}
            >
              <Star className={`w-6 h-6 ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
            </button>
          )
        })}
      </div>
      <textarea
        value={comment}
        onChange={event => setComment(event.target.value)}
        maxLength={2000}
        rows={3}
        className="form-input resize-none"
        placeholder="Napisz kilka słów o treningu (opcjonalnie)"
      />
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="flex gap-3 mt-3">
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary">
          {saving ? 'Zapisywanie…' : 'Zapisz opinię'}
        </button>
        {existing && (
          <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary">
            Anuluj
          </button>
        )}
      </div>
    </div>
  )
}
