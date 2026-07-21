'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FormTemplatePicker from '@/components/FormTemplatePicker'
import ImageCropUploader from '@/components/ImageCropUploader'
import DateTimePicker from '@/components/DateTimePicker'
import GalleryUploader from '@/components/GalleryUploader'
import { EVENT_TYPES } from '@/lib/eventTypes'
import { ensureSpeedwayClassificationFields } from '@/lib/speedway'
import type { FormField } from '@/types'

const MapPicker = dynamic(() => import('@/components/MapPicker'), {
  ssr: false,
  loading: () => <div className="w-full h-64 rounded-xl bg-slate-100 animate-pulse" />,
})

export default function NewEventPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventTypeId, setEventTypeId] = useState<string>('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [formFields, setFormFields] = useState<FormField[]>([])
  const [hasResults, setHasResults] = useState(false)
  const [resultsPublic, setResultsPublic] = useState(true)
  const [hasSchedule, setHasSchedule] = useState(false)
  const [autoConfirm, setAutoConfirm] = useState(false)
  const [maxParticipants, setMaxParticipants] = useState<string>('')
  const [entryFeeEnabled, setEntryFeeEnabled] = useState(false)
  const [entryFee, setEntryFee] = useState<string>('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [galleryImages, setGalleryImages] = useState<string[]>([])
  const [startAt, setStartAt] = useState<string | null>(null)
  const [endAt, setEndAt] = useState<string | null>(null)
  const [registrationOpensAt, setRegistrationOpensAt] = useState<string | null>(null)
  const [registrationDeadline, setRegistrationDeadline] = useState<string | null>(null)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [location, setLocation] = useState<string>('')
  const [groupingField, setGroupingField] = useState<string>('')

  function handleEventTypeChange(id: string) {
    setEventTypeId(id)
    setSelectedTemplateId(null)
    setFormFields(ensureSpeedwayClassificationFields([], id))
  }

  function handleTemplateSelect(templateId: string | null, fields: FormField[]) {
    setSelectedTemplateId(templateId)
    setFormFields(fields)
  }

  function handleMapLocation(newLat: number, newLng: number, address: string) {
    setLat(newLat)
    setLng(newLng)
    setLocation(address)
  }

  const groupableFields = formFields.filter(f =>
    ['select', 'multiselect', 'multidate'].includes(f.type)
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (entryFeeEnabled && !entryFee.trim()) {
      setError('Podaj kwotę wpisowego lub odznacz opcję pobierania wpisowego.')
      return
    }
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const payload = {
      title: form.get('title'),
      description: form.get('description') || null,
      location: location || null,
      start_at: startAt,
      end_at: endAt || null,
      registration_opens_at: registrationOpensAt || null,
      registration_deadline: registrationDeadline || null,
      status: 'upcoming',
      event_type_id: eventTypeId || null,
      form_fields: formFields,
      has_results: hasResults,
      results_public: resultsPublic,
      has_schedule: hasSchedule,
      auto_confirm: autoConfirm,
      max_participants: maxParticipants ? parseInt(maxParticipants, 10) : null,
      entry_fee: entryFeeEnabled && entryFee ? parseFloat(entryFee) : null,
      image_url: imageUrl,
      organizer_name: (form.get('organizer_name') as string) || null,
      lat,
      lng,
      gallery_images: galleryImages,
      grouping_field: groupingField || null,
      form_template_id: selectedTemplateId,
    }

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
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

  const selectedType = EVENT_TYPES.find(t => t.id === eventTypeId)

  return (
    <div>
      <Link href="/organizer" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        ← Panel organizatora
      </Link>
      <h1 className="page-title">➕ Nowe wydarzenie</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card space-y-4">
          <div>
            <label className="form-label">Typ wydarzenia *</label>
            <select
              className="form-input"
              value={eventTypeId}
              onChange={e => handleEventTypeChange(e.target.value)}
              required
            >
              <option value="">— wybierz typ —</option>
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
              name="organizer_name"
              placeholder="Imię i nazwisko lub nazwa klubu"
            />
          </div>
          <div>
            <label className="form-label">Tytuł *</label>
            <input
              className="form-input"
              name="title"
              required
              placeholder={
                selectedType
                  ? `${selectedType.icon} ${selectedType.name} – Wiosna 2026`
                  : 'Tytuł wydarzenia'
              }
            />
          </div>
          <div>
            <label className="form-label">Opis</label>
            <textarea
              className="form-input"
              name="description"
              rows={3}
              placeholder="Krótki opis wydarzenia, zasady, kategorie..."
            />
          </div>

          {/* Location + Map */}
          <div>
            <label className="form-label">Lokalizacja</label>
            <MapPicker lat={lat} lng={lng} location={location} onLocationChange={handleMapLocation} />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Data rozpoczęcia *</label>
              <DateTimePicker value={startAt} onChange={setStartAt} required placeholder="Wybierz datę startu" />
            </div>
            <div>
              <label className="form-label">Data zakończenia</label>
              <DateTimePicker value={endAt} onChange={setEndAt} placeholder="Opcjonalnie" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Początek zapisów</label>
              <DateTimePicker
                value={registrationOpensAt}
                onChange={setRegistrationOpensAt}
                placeholder="Od razu"
                maxDate={registrationDeadline || startAt ? new Date(registrationDeadline ?? startAt!) : undefined}
              />
              <p className="text-xs text-slate-400 mt-1">Przed tą datą przycisk zapisów będzie nieaktywny.</p>
            </div>
            <div>
              <label className="form-label">Koniec zapisów</label>
              <DateTimePicker
                value={registrationDeadline}
                onChange={setRegistrationDeadline}
                placeholder="Opcjonalnie"
                minDate={registrationOpensAt ? new Date(registrationOpensAt) : undefined}
                maxDate={startAt ? new Date(startAt) : undefined}
              />
              <p className="text-xs text-slate-400 mt-1">Po tym terminie zapisy zostaną automatycznie zamknięte.</p>
            </div>
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
                checked={entryFeeEnabled}
                onChange={e => { setEntryFeeEnabled(e.target.checked); if (!e.target.checked) setEntryFee('') }}
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-slate-700">Pobieraj wpisowe</span>
                <p className="text-xs text-slate-400 mt-0.5">Podaj kwotę wpisowego dla uczestników.</p>
                {entryFeeEnabled && (
                  <div className="mt-2">
                    <label className="form-label">Kwota wpisowego (zł) *</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="np. 25"
                      value={entryFee}
                      onChange={e => setEntryFee(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </label>
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
        </div>

        {/* Thumbnail */}
        <div className="card space-y-3">
          <ImageCropUploader currentUrl={imageUrl} onUrlChange={setImageUrl} />
        </div>

        {/* Gallery */}
        <div className="card space-y-3">
          <GalleryUploader images={galleryImages} onImagesChange={setGalleryImages} />
        </div>

        {/* Template picker section */}
        <div className="card space-y-3">
          <div>
            <h2 className="font-semibold text-slate-800">📋 Formularz zapisów</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Wybierz szablon pól dodatkowych lub stwórz nowy.
            </p>
          </div>
          <FormTemplatePicker
            eventTypeId={eventTypeId || null}
            selectedTemplateId={selectedTemplateId}
            onSelect={handleTemplateSelect}
          />

          {/* Grouping field */}
          {groupableFields.length > 0 && (
            <div>
              <label className="form-label">Grupuj zapisy według</label>
              <select
                className="form-input"
                value={groupingField}
                onChange={e => setGroupingField(e.target.value)}
              >
                <option value="">— brak grupowania —</option>
                {groupableFields.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Listy zapisów będą pogrupowane według tego pola.</p>
            </div>
          )}

          {/* Schedule */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 rounded"
              checked={hasSchedule}
              onChange={e => setHasSchedule(e.target.checked)}
            />
            <div>
              <span className="text-sm font-medium text-slate-700">Włącz grafik startów</span>
              <p className="text-xs text-slate-400 mt-0.5">Organizator będzie mógł przypisywać uczestnikom terminy startów.</p>
            </div>
          </label>
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
            {loading ? 'Tworzenie...' : 'Utwórz wydarzenie'}
          </button>
        </div>
      </form>
    </div>
  )
}


