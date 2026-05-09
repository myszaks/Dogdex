'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import FormTemplatePicker from '@/components/FormTemplatePicker'
import ImageCropUploader from '@/components/ImageCropUploader'
import { EVENT_TYPES } from '@/lib/eventTypes'
import type { FormField } from '@/types'

interface Props {
  eventId: string
  initialData: {
    title: string
    description: string | null
    location: string | null
    start_at: string | null
    end_at: string | null
    registration_deadline: string | null
    status: string
    event_type_id: string | null
    form_fields: FormField[]
    has_results: boolean
    results_public: boolean
    auto_confirm: boolean
    max_participants: number | null
    image_url: string | null
    organizer_name: string | null
  }
}

export default function EditEventClient({ eventId, initialData }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventTypeId, setEventTypeId] = useState<string>(initialData.event_type_id ?? '')
  const [formFields, setFormFields] = useState<FormField[]>(initialData.form_fields ?? [])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [hasResults, setHasResults] = useState(initialData.has_results ?? false)
  const [resultsPublic, setResultsPublic] = useState(initialData.results_public ?? true)
  const [autoConfirm, setAutoConfirm] = useState(initialData.auto_confirm ?? false)
  const [maxParticipants, setMaxParticipants] = useState<string>(
    initialData.max_participants != null ? String(initialData.max_participants) : ''
  )
  const [imageUrl, setImageUrl] = useState<string | null>(initialData.image_url ?? null)
  const [organizerName, setOrganizerName] = useState<string>(initialData.organizer_name ?? '')

  function toLocalDatetime(isoStr: string | null): string {
    if (!isoStr) return ''
    return isoStr.slice(0, 16)
  }

  function handleEventTypeChange(id: string) {
    setEventTypeId(id)
    // Only pre-fill default fields if currently empty (don't override existing)
    if (formFields.length === 0) {
      const et = EVENT_TYPES.find(t => t.id === id)
      if (et) {
        setFormFields(et.defaultFields.map(f => ({ ...f, id: `${f.id}_${Date.now()}` })))
      }
    }
  }

  function handleTemplateSelect(templateId: string | null, fields: FormField[]) {
    setSelectedTemplateId(templateId)
    setFormFields(fields)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const payload = {
      title: form.get('title'),
      description: form.get('description') || null,
      location: form.get('location') || null,
      start_at: form.get('start_at') || null,
      end_at: form.get('end_at') || null,
      registration_deadline: form.get('registration_deadline') || null,
      status: form.get('status'),
      event_type_id: eventTypeId || null,
      form_fields: formFields,
      has_results: hasResults,
      results_public: resultsPublic,
      auto_confirm: autoConfirm,
      max_participants: maxParticipants ? parseInt(maxParticipants, 10) : null,
      image_url: imageUrl,
      organizer_name: organizerName.trim() || null,
    }
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Błąd serwera')
      }
      router.push('/organizer')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card space-y-4">
          <div>
            <label className="form-label">Typ wydarzenia</label>
            <select
              className="form-input"
              value={eventTypeId}
              onChange={e => handleEventTypeChange(e.target.value)}
            >
              <option value="">— brak / nie wybrano —</option>
              {EVENT_TYPES.map(t => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Organizator</label>
            <input
              className="form-input"
              placeholder="Imię i nazwisko lub nazwa klubu"
              value={organizerName}
              onChange={e => setOrganizerName(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Tytuł *</label>
            <input
              className="form-input"
              name="title"
              required
              defaultValue={initialData.title}
            />
          </div>
          <div>
            <label className="form-label">Opis</label>
            <textarea
              className="form-input"
              name="description"
              rows={3}
              defaultValue={initialData.description ?? ''}
            />
          </div>
          <div>
            <label className="form-label">Lokalizacja</label>
            <input
              className="form-input"
              name="location"
              defaultValue={initialData.location ?? ''}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Data rozpoczęcia</label>
              <input
                className="form-input"
                type="datetime-local"
                name="start_at"
                defaultValue={toLocalDatetime(initialData.start_at)}
              />
            </div>
            <div>
              <label className="form-label">Data zakończenia</label>
              <input
                className="form-input"
                type="datetime-local"
                name="end_at"
                defaultValue={toLocalDatetime(initialData.end_at)}
              />
            </div>
          </div>
          <div>
            <label className="form-label">Termin zapisów</label>
            <input
              className="form-input"
              type="datetime-local"
              name="registration_deadline"
              defaultValue={toLocalDatetime(initialData.registration_deadline)}
            />
            <p className="text-xs text-slate-400 mt-1">Po tym terminie zapisy zostaną automatycznie zamknięte.</p>
          </div>

          {/* Registrations settings */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">📝 Zapisy</p>
            <div>
              <label className="form-label">Limit miejsc</label>
              <input
                className="form-input"
                type="number"
                min="1"
                placeholder="np. 50 (zostaw puste = bez limitu)"
                value={maxParticipants}
                onChange={e => setMaxParticipants(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 rounded"
                checked={autoConfirm}
                onChange={e => setAutoConfirm(e.target.checked)}
              />
              <div>
                <span className="text-sm font-medium text-slate-700">Auto-potwierdzenie zapisów</span>
                <p className="text-xs text-slate-400 mt-0.5">Każdy zapis będzie od razu potwierdzony (bez oczekiwania na akceptację organizatora).</p>
              </div>
            </label>
          </div>

          {/* Results settings */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">🏆 Wyniki i ranking</p>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 rounded"
                checked={hasResults}
                onChange={e => setHasResults(e.target.checked)}
              />
              <div>
                <span className="text-sm font-medium text-slate-700">Włącz wyniki i ranking</span>
                <p className="text-xs text-slate-400 mt-0.5">Organizator będzie mógł wpisywać wyniki; pojawi się widok live dla uczestników.</p>
              </div>
            </label>
            {hasResults && (
              <label className="flex items-start gap-3 cursor-pointer select-none pl-6">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded"
                  checked={resultsPublic}
                  onChange={e => setResultsPublic(e.target.checked)}
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">Wyniki widoczne publicznie (live)</span>
                  <p className="text-xs text-slate-400 mt-0.5">Odznacz, jeśli chcesz opublikować wyniki dopiero po zakończeniu rywalizacji.</p>
                </div>
              </label>
            )}
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-input" name="status" defaultValue={initialData.status}>
              <option value="upcoming">Nadchodzące</option>
              <option value="ongoing">W trakcie</option>
              <option value="finished">Zakończone</option>
              <option value="cancelled">Odwołane</option>
            </select>
          </div>
        </div>

        {/* Thumbnail */}
        <div className="card space-y-3">
          <ImageCropUploader currentUrl={imageUrl} onUrlChange={setImageUrl} />
        </div>

        {/* Form builder */}
        <div className="card space-y-3">
          <div>
            <h2 className="font-semibold text-slate-800">📋 Formularz zapisów</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Wybierz szablon lub edytuj pola ręcznie.
            </p>
          </div>
          <FormTemplatePicker
            eventTypeId={eventTypeId || null}
            selectedTemplateId={selectedTemplateId}
            onSelect={handleTemplateSelect}
          />
        </div>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn btn-secondary flex-1"
          >
            Anuluj
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1">
            {loading ? 'Zapisywanie...' : 'Zapisz zmiany'}
          </button>
        </div>
      </form>
    </div>
  )
}
