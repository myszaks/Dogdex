'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { TrainingType } from '@/types'

interface FormState {
  name: string
  description: string
  pricePerHour: string
  durationMin: string
  isActive: boolean
}

export default function EditTrainingTypePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetch(`/api/training-types/${encodeURIComponent(params.id)}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Nie udało się pobrać typu treningu')
        if (cancelled) return

        const trainingType = data as TrainingType
        setForm({
          name: trainingType.name,
          description: trainingType.description ?? '',
          pricePerHour: trainingType.price_per_hour?.toString() ?? '',
          durationMin: trainingType.duration_min.toString(),
          isActive: trainingType.is_active,
        })
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [params.id])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!form || saving) return

    const price = form.pricePerHour.trim() === '' ? null : Number(form.pricePerHour)
    const duration = Number(form.durationMin)
    if (!form.name.trim()) {
      setError('Nazwa jest wymagana')
      return
    }
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setError('Podaj prawidłową cenę')
      return
    }
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
      setError('Czas treningu musi wynosić od 15 do 480 minut')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/training-types/${encodeURIComponent(params.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          price_per_hour: price,
          duration_min: duration,
          is_active: form.isActive,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Nie udało się zapisać zmian')

      router.push('/trainer/types')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href="/trainer/types"
        className="inline-flex items-center gap-2 text-accent hover:underline mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Wróć do rodzajów treningów
      </Link>

      <h1 className="font-heading font-bold text-3xl mb-6">Edytuj rodzaj treningu</h1>

      {loading && <div className="text-muted-foreground">Ładowanie…</div>}

      {!loading && !form && (
        <div className="card p-6">
          <p className="text-red-700">{error ?? 'Nie znaleziono typu treningu'}</p>
        </div>
      )}

      {form && (
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label htmlFor="training-name" className="block text-sm font-semibold mb-2">
              Nazwa *
            </label>
            <input
              id="training-name"
              type="text"
              required
              maxLength={120}
              value={form.name}
              onChange={(event) => setForm((current) => current && ({
                ...current,
                name: event.target.value,
              }))}
              className="form-input"
            />
          </div>

          <div>
            <label htmlFor="training-description" className="block text-sm font-semibold mb-2">
              Opis
            </label>
            <textarea
              id="training-description"
              maxLength={2000}
              rows={4}
              value={form.description}
              onChange={(event) => setForm((current) => current && ({
                ...current,
                description: event.target.value,
              }))}
              className="form-input resize-none"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="training-price" className="block text-sm font-semibold mb-2">
                Cena za godzinę (PLN)
              </label>
              <input
                id="training-price"
                type="number"
                min="0"
                max="100000"
                step="0.01"
                value={form.pricePerHour}
                onChange={(event) => setForm((current) => current && ({
                  ...current,
                  pricePerHour: event.target.value,
                }))}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="training-duration" className="block text-sm font-semibold mb-2">
                Czas trwania (min)
              </label>
              <input
                id="training-duration"
                type="number"
                required
                min="15"
                max="480"
                step="15"
                value={form.durationMin}
                onChange={(event) => setForm((current) => current && ({
                  ...current,
                  durationMin: event.target.value,
                }))}
                className="form-input"
              />
            </div>
          </div>

          <label htmlFor="training-type-active" className="flex items-center gap-3 text-sm font-medium">
            <input
              id="training-type-active"
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => current && ({
                ...current,
                isActive: event.target.checked,
              }))}
              className="h-4 w-4"
            />
            Oferta aktywna i widoczna publicznie
          </label>

          {error && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Link href="/trainer/types" className="btn btn-secondary flex-1 justify-center">
              Anuluj
            </Link>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">
              {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
