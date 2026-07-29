'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Activity,
  Award,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  GalleryHorizontal,
  HelpCircle,
  ImagePlus,
  Info,
  ListChecks,
  MapPin,
  PawPrint,
  Rocket,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import FormTemplatePicker from '@/components/FormTemplatePicker'
import EventCreatorTutorial from '@/components/EventCreatorTutorial'
import EventResultsSetup from '@/components/EventResultsSetup'
import ImageCropUploader from '@/components/ImageCropUploader'
import DateTimePicker from '@/components/DateTimePicker'
import GalleryUploader from '@/components/GalleryUploader'
import { EVENT_TYPES } from '@/lib/eventTypes'
import { validateCompetitionFieldValues } from '@/lib/competitionEngine'
import { getLiveVisibilityLabel } from '@/lib/eventCompetitionSetup'
import { cn } from '@/lib/utils'
import type { FormField } from '@/types'
import type { CompetitionFormatDefinition, CompetitionScalar } from '@/types/competition'

const MapPicker = dynamic(() => import('@/components/MapPicker'), {
  ssr: false,
  loading: () => <div className="w-full h-64 rounded-2xl bg-sage-100 animate-pulse" />,
})

const STEPS = [
  { label: 'Podstawowe informacje', shortLabel: 'Informacje', Icon: FileText },
  { label: 'Lokalizacja i czas', shortLabel: 'Lokalizacja', Icon: MapPin },
  { label: 'Rejestracja i limity', shortLabel: 'Rejestracja', Icon: Users },
  { label: 'Wyniki i transmisja live', shortLabel: 'Wyniki i live', Icon: Trophy },
  { label: 'Podgląd i publikacja', shortLabel: 'Podgląd', Icon: Eye },
]

type EventVisual = {
  label: string
  description: string
  Icon: LucideIcon
}

function getEventVisual(id: string, fallbackName: string): EventVisual {
  const normalized = id.toLowerCase()

  if (normalized === 'speedway') {
    return {
      label: 'Szybkość',
      description: 'Tory, czasy i rywalizacja sportowa.',
      Icon: Zap,
    }
  }
  if (normalized === 'agility') {
    return {
      label: 'Agility',
      description: 'Zawody sprawnościowe z przeszkodami.',
      Icon: PawPrint,
    }
  }
  if (normalized === 'fullfocus' || normalized === 'obedience' || normalized === 'rally_o') {
    return {
      label: normalized === 'fullfocus' ? 'Skupienie' : fallbackName,
      description: 'Precyzja, posłuszeństwo i praca z przewodnikiem.',
      Icon: Activity,
    }
  }
  if (normalized === 'flyball') {
    return {
      label: 'Drużynowe',
      description: 'Starty zespołowe i kategorie drużyn.',
      Icon: Users,
    }
  }
  if (normalized === 'spacer') {
    return {
      label: 'Spacer',
      description: 'Spotkania terenowe i wydarzenia socjalizacyjne.',
      Icon: MapPin,
    }
  }
  if (normalized === 'dog_show') {
    return {
      label: 'Wystawa',
      description: 'Klasy, certyfikaty i oceny wystawowe.',
      Icon: Trophy,
    }
  }
  if (normalized === 'canicross') {
    return {
      label: 'Canicross',
      description: 'Bieganie, bikejoring i dyscypliny zaprzęgowe.',
      Icon: Award,
    }
  }
  if (normalized.includes('wyk')) {
    return {
      label: 'Szkolenie',
      description: 'Wykłady, warsztaty i wydarzenia edukacyjne.',
      Icon: ListChecks,
    }
  }

  return {
    label: fallbackName,
    description: 'Własny format wydarzenia.',
    Icon: PawPrint,
  }
}

function formatDateTime(value: string | null) {
  if (!value) return 'Do uzupełnienia'
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatMoney(value: string) {
  const parsed = parseFloat(value)
  if (Number.isNaN(parsed)) return '0.00 PLN'
  return `${parsed.toFixed(2)} PLN`
}

function durationLabel(startAt: string | null, endAt: string | null) {
  if (!startAt || !endAt) return 'Jednodniowe'
  const start = new Date(startAt).getTime()
  const end = new Date(endAt).getTime()
  const diff = end - start
  if (diff <= 0) return 'Sprawdź daty'
  const hours = Math.max(1, Math.round(diff / 36e5))
  if (hours < 24) return `${hours} godz.`
  const days = Math.ceil(hours / 24)
  return `${days} ${days === 1 ? 'dzień' : 'dni'}`
}

export default function NewEventPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [savingMode, setSavingMode] = useState<'draft' | 'publish' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tutorialSession, setTutorialSession] = useState(0)

  const [eventTypeId, setEventTypeId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [organizerName, setOrganizerName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [formFields, setFormFields] = useState<FormField[]>([])
  const [hasResults, setHasResults] = useState(false)
  const [resultsPublic, setResultsPublic] = useState(true)
  const [competitionFormatId, setCompetitionFormatId] = useState<string | null>(null)
  const [competitionDefinition, setCompetitionDefinition] = useState<CompetitionFormatDefinition | null>(null)
  const [competitionValues, setCompetitionValues] = useState<Record<string, CompetitionScalar>>({})
  const [hasSchedule, setHasSchedule] = useState(false)
  const [autoConfirm, setAutoConfirm] = useState(false)
  const [maxParticipants, setMaxParticipants] = useState<string>('')
  const [entryFeeEnabled, setEntryFeeEnabled] = useState(false)
  const [entryFee, setEntryFee] = useState<string>('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [galleryImages, setGalleryImages] = useState<string[]>([])
  const [startAt, setStartAt] = useState<string | null>(null)
  const [endAt, setEndAt] = useState<string | null>(null)
  const [registrationDeadline, setRegistrationDeadline] = useState<string | null>(null)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [location, setLocation] = useState<string>('')
  const [venueName, setVenueName] = useState('')
  const [groupingField, setGroupingField] = useState<string>('')

  const selectedType = EVENT_TYPES.find(t => t.id === eventTypeId)
  const selectedVisual = selectedType ? getEventVisual(selectedType.id, selectedType.name) : null
  const groupableFields = useMemo(
    () => formFields.filter(f => ['select', 'multiselect', 'multidate'].includes(f.type)),
    [formFields],
  )
  const locationSummary = [venueName.trim(), location.trim()].filter(Boolean).join(', ')
  const visibleLocation = locationSummary || 'Lokalizacja do uzupełnienia'
  const seatsLabel = maxParticipants ? `${maxParticipants} miejsc` : 'Bez limitu miejsc'
  const feeLabel = entryFeeEnabled ? formatMoney(entryFee) : 'Bezpłatne'

  function handleEventTypeChange(id: string) {
    setEventTypeId(id)
    setSelectedTemplateId(null)
    setFormFields([])
    setGroupingField('')
  }

  function handleCompetitionFormatSelect(
    id: string | null,
    definition: CompetitionFormatDefinition | null,
  ) {
    setCompetitionFormatId(id)
    setCompetitionDefinition(definition)
    const allowedIds = new Set(definition?.eventFields.map(field => field.id) ?? [])
    setCompetitionValues(current => Object.fromEntries(
      Object.entries(current).filter(([key]) => allowedIds.has(key))
    ))
  }

  function handleTemplateSelect(templateId: string | null, fields: FormField[]) {
    setSelectedTemplateId(templateId)
    setFormFields(fields)
    if (!fields.some(f => f.id === groupingField)) setGroupingField('')
  }

  function handleMapLocation(newLat: number, newLng: number, address: string) {
    setLat(newLat)
    setLng(newLng)
    setLocation(address)
  }

  function validateStep(step: number) {
    setError(null)

    if (step === 0) {
      if (!eventTypeId) {
        setError('Wybierz typ wydarzenia.')
        return false
      }
      if (!title.trim()) {
        setError('Podaj nazwę wydarzenia.')
        return false
      }
    }

    if (step === 1) {
      if (!startAt) {
        setError('Wybierz datę rozpoczęcia wydarzenia.')
        return false
      }
      if (startAt && endAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
        setError('Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.')
        return false
      }
    }

    if (step === 2) {
      if (entryFeeEnabled && !entryFee.trim()) {
        setError('Podaj kwotę wpisowego lub odznacz pobieranie wpisowego.')
        return false
      }
    }

    if (step === 3 && hasResults && competitionDefinition) {
      const valueIssues = validateCompetitionFieldValues(
        competitionDefinition.eventFields,
        competitionValues,
      )
      if (valueIssues.length > 0) {
        const field = competitionDefinition.eventFields.find(candidate =>
          valueIssues[0].path.includes(candidate.id)
        )
        setError(
          field
            ? `Uzupełnij pole „${field.label}” w ustawieniach wyników.`
            : valueIssues[0].message,
        )
        return false
      }
    }

    return true
  }

  function goToStep(nextStep: number) {
    if (nextStep === currentStep) return
    if (nextStep < currentStep) {
      setError(null)
      setCurrentStep(nextStep)
      return
    }

    for (let step = currentStep; step < nextStep; step += 1) {
      if (!validateStep(step)) {
        setCurrentStep(step)
        return
      }
    }
    setCurrentStep(nextStep)
  }

  function goNext() {
    if (!validateStep(currentStep)) return
    setCurrentStep(step => Math.min(STEPS.length - 1, step + 1))
  }

  function goBack() {
    setError(null)
    if (currentStep === 0) {
      router.back()
      return
    }
    setCurrentStep(step => Math.max(0, step - 1))
  }

  async function saveEvent(status: 'draft' | 'upcoming') {
    const isDraft = status === 'draft'

    if (!isDraft) {
      for (let step = 0; step < STEPS.length - 1; step += 1) {
        if (!validateStep(step)) {
          setCurrentStep(step)
          return
        }
      }
    }

    setLoading(true)
    setSavingMode(isDraft ? 'draft' : 'publish')
    setError(null)

    const payload = {
      title: title.trim() || 'Szkic wydarzenia',
      description: description.trim() || null,
      location: locationSummary || null,
      start_at: startAt,
      end_at: endAt || null,
      registration_deadline: registrationDeadline || null,
      status,
      event_type_id: eventTypeId || null,
      form_fields: formFields,
      has_results: hasResults,
      results_public: resultsPublic,
      has_schedule: hasSchedule,
      auto_confirm: autoConfirm,
      max_participants: maxParticipants ? parseInt(maxParticipants, 10) : null,
      entry_fee: entryFeeEnabled && entryFee ? parseFloat(entryFee) : null,
      image_url: imageUrl,
      organizer_name: organizerName.trim() || null,
      lat,
      lng,
      gallery_images: galleryImages,
      grouping_field: groupingField || null,
      form_template_id: selectedTemplateId,
      competition_format_id: competitionFormatId,
      competition_config: competitionFormatId ? undefined : competitionDefinition,
      competition_values: competitionValues,
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
      setSavingMode(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Nowe wydarzenie</p>
          <h1 className="mt-2 text-4xl font-heading font-bold text-primary">Kreator Wydarzenia</h1>
          <p className="mt-2 text-muted-foreground">
            Krok {currentStep + 1}: {STEPS[currentStep].label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTutorialSession(session => session + 1)}
            className="btn btn-secondary btn-sm"
          >
            <HelpCircle className="h-4 w-4" />
            Jak działa kreator?
          </button>
          <div className="flex items-center gap-3 rounded-full border border-sage-200 bg-white px-4 py-2 text-sm text-sage-600 shadow-sm">
            <Check className="h-4 w-4 text-accent" />
            Stan formularza jest zachowywany między krokami
          </div>
        </div>
      </div>

      <EventCreatorTutorial
        key={`${currentStep}-${tutorialSession}`}
        currentStep={currentStep}
        forceStart={tutorialSession > 0}
        onManualComplete={() => setTutorialSession(0)}
      />

      <div className="overflow-hidden rounded-3xl border border-sage-200 bg-white shadow-sm">
        <WizardStepper currentStep={currentStep} onStepChange={goToStep} />

        <div className="p-5 sm:p-8 lg:p-10">
          {currentStep === 0 && (
            <StepBasicInfo
              title={title}
              organizerName={organizerName}
              description={description}
              eventTypeId={eventTypeId}
              imageUrl={imageUrl}
              galleryImages={galleryImages}
              selectedTypeName={selectedType?.name}
              onTitleChange={setTitle}
              onOrganizerNameChange={setOrganizerName}
              onDescriptionChange={setDescription}
              onEventTypeChange={handleEventTypeChange}
              onImageUrlChange={setImageUrl}
              onGalleryImagesChange={setGalleryImages}
            />
          )}

          {currentStep === 1 && (
            <StepLocationTime
              venueName={venueName}
              location={location}
              lat={lat}
              lng={lng}
              startAt={startAt}
              endAt={endAt}
              duration={durationLabel(startAt, endAt)}
              onVenueNameChange={setVenueName}
              onLocationChange={handleMapLocation}
              onStartAtChange={setStartAt}
              onEndAtChange={setEndAt}
            />
          )}

          {currentStep === 2 && (
            <StepRegistration
              maxParticipants={maxParticipants}
              registrationDeadline={registrationDeadline}
              entryFeeEnabled={entryFeeEnabled}
              entryFee={entryFee}
              autoConfirm={autoConfirm}
              hasSchedule={hasSchedule}
              eventTypeId={eventTypeId || null}
              selectedTemplateId={selectedTemplateId}
              groupableFields={groupableFields}
              groupingField={groupingField}
              formFieldsCount={formFields.length}
              onMaxParticipantsChange={setMaxParticipants}
              onRegistrationDeadlineChange={setRegistrationDeadline}
              onEntryFeeEnabledChange={checked => {
                setEntryFeeEnabled(checked)
                if (!checked) setEntryFee('')
              }}
              onEntryFeeChange={setEntryFee}
              onAutoConfirmChange={setAutoConfirm}
              onHasScheduleChange={setHasSchedule}
              onTemplateSelect={handleTemplateSelect}
              onGroupingFieldChange={setGroupingField}
            />
          )}

          {currentStep === 3 && (
            <EventResultsSetup
              eventTypeId={eventTypeId || null}
              enabled={hasResults}
              resultsPublic={resultsPublic}
              formatId={competitionFormatId}
              definition={competitionDefinition}
              values={competitionValues}
              onEnabledChange={checked => {
                setHasResults(checked)
                if (!checked) {
                  setResultsPublic(true)
                  setCompetitionFormatId(null)
                  setCompetitionDefinition(null)
                  setCompetitionValues({})
                }
              }}
              onResultsPublicChange={setResultsPublic}
              onFormatSelect={handleCompetitionFormatSelect}
              onValuesChange={setCompetitionValues}
            />
          )}

          {currentStep === 4 && (
            <StepPreview
              title={title}
              description={description}
              organizerName={organizerName}
              imageUrl={imageUrl}
              selectedVisual={selectedVisual}
              location={visibleLocation}
              startAt={startAt}
              endAt={endAt}
              registrationDeadline={registrationDeadline}
              seatsLabel={seatsLabel}
              feeLabel={feeLabel}
              autoConfirm={autoConfirm}
              hasResults={hasResults}
              resultsPublic={resultsPublic}
              hasSchedule={hasSchedule}
              galleryCount={galleryImages.length}
              formFieldsCount={formFields.length}
              groupingEnabled={Boolean(groupingField)}
            />
          )}
        </div>

        {error && (
          <div className="mx-5 mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-8 lg:mx-10">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 border-t border-sage-200 bg-white/90 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <button
            type="button"
            onClick={goBack}
            className="btn btn-secondary min-h-12 px-6"
          >
            <ChevronLeft className="h-4 w-4" />
            {currentStep === 0 ? 'Panel organizatora' : 'Wstecz'}
          </button>

          {currentStep < STEPS.length - 1 ? (
            <button type="button" onClick={goNext} className="btn btn-primary min-h-12 px-8 shadow-primary/10">
              Dalej
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => saveEvent('draft')} disabled={loading} className="btn btn-secondary min-h-12 px-8">
                {loading && savingMode === 'draft' ? 'Zapisywanie...' : 'Zapisz jako szkic'}
              </button>
              <button type="button" onClick={() => saveEvent('upcoming')} disabled={loading} className="btn btn-primary min-h-12 px-8 shadow-primary/10">
                {loading && savingMode === 'publish' ? 'Publikowanie...' : 'Opublikuj teraz'}
                <Rocket className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WizardStepper({
  currentStep,
  onStepChange,
}: {
  currentStep: number
  onStepChange: (step: number) => void
}) {
  return (
    <div className="border-b border-sage-200 bg-white px-4 py-5 sm:px-8 lg:px-10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map(({ label, shortLabel, Icon }, index) => {
          const active = index === currentStep
          const complete = index < currentStep

          return (
            <button
              key={label}
              type="button"
              onClick={() => onStepChange(index)}
              className="group flex items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-sage-50"
            >
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors',
                  active && 'border-accent bg-white text-accent ring-4 ring-orange-100',
                  complete && 'border-primary bg-primary text-white',
                  !active && !complete && 'border-sage-200 bg-white text-sage-400',
                )}
              >
                {complete ? <Check className="h-4 w-4" /> : active ? index + 1 : <Icon className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-[11px] font-bold uppercase tracking-[0.18em]',
                    active ? 'text-accent' : complete ? 'text-primary' : 'text-sage-400',
                  )}
                >
                  Krok {index + 1}
                </span>
                <span className={cn('block truncate text-sm font-semibold', active ? 'text-primary' : 'text-sage-500')}>
                  <span className="hidden lg:inline">{label}</span>
                  <span className="lg:hidden">{shortLabel}</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepBasicInfo({
  title,
  organizerName,
  description,
  eventTypeId,
  imageUrl,
  galleryImages,
  selectedTypeName,
  onTitleChange,
  onOrganizerNameChange,
  onDescriptionChange,
  onEventTypeChange,
  onImageUrlChange,
  onGalleryImagesChange,
}: {
  title: string
  organizerName: string
  description: string
  eventTypeId: string
  imageUrl: string | null
  galleryImages: string[]
  selectedTypeName?: string
  onTitleChange: (value: string) => void
  onOrganizerNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onEventTypeChange: (value: string) => void
  onImageUrlChange: (url: string | null) => void
  onGalleryImagesChange: (urls: string[]) => void
}) {
  return (
    <div className="space-y-8">
      <SectionHeader
        Icon={ImagePlus}
        eyebrow="Miniaturka wydarzenia"
        title="Pierwsze wrażenie i najważniejsze informacje"
        description="Dodaj zdjęcie, nazwę, organizatora i wybierz typ wydarzenia. Galeria jest zachowana jako część obecnego kreatora."
      />

      <div data-tutorial-id="event-cover" className="mx-auto max-w-2xl rounded-3xl border-2 border-dashed border-sage-200 bg-sage-50/60 p-3 sm:p-4">
        <ImageCropUploader currentUrl={imageUrl} onUrlChange={onImageUrlChange} />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div data-tutorial-id="event-details" className="space-y-5">
          <div>
            <label className="form-label uppercase tracking-[0.16em] text-sage-500">Nazwa wydarzenia *</label>
            <input
              className="form-input min-h-14 bg-sage-50 text-base font-semibold"
              name="title"
              value={title}
              onChange={e => onTitleChange(e.target.value)}
              placeholder={
                selectedTypeName
                  ? `${selectedTypeName} - Wiosna 2026`
                  : 'Np. Międzynarodowe Zawody Agility'
              }
              required
            />
          </div>

          <div>
            <label className="form-label uppercase tracking-[0.16em] text-sage-500">Organizator</label>
            <input
              className="form-input min-h-12 bg-sage-50"
              name="organizer_name"
              value={organizerName}
              onChange={e => onOrganizerNameChange(e.target.value)}
              placeholder="Imię i nazwisko lub nazwa klubu"
            />
          </div>

          <div>
            <label className="form-label uppercase tracking-[0.16em] text-sage-500">Szczegółowy opis</label>
            <textarea
              className="form-input min-h-44 bg-sage-50 text-base leading-7"
              name="description"
              value={description}
              onChange={e => onDescriptionChange(e.target.value)}
              placeholder="Opisz misję, zasady, kategorie i unikalne cechy Twojego wydarzenia..."
            />
          </div>

          <div className="rounded-3xl border border-sage-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-accent">
                <GalleryHorizontal className="h-5 w-5" />
              </span>
              <div>
                <h2 className="section-title mb-0">Galeria zdjęć</h2>
                <p className="text-sm text-muted-foreground">Dodatkowe zdjęcia wydarzenia dla strony publicznej.</p>
              </div>
            </div>
            <GalleryUploader images={galleryImages} onImagesChange={onGalleryImagesChange} />
          </div>
        </div>

        <div data-tutorial-id="event-type" className="space-y-4">
          <div>
            <p className="form-label uppercase tracking-[0.16em] text-sage-500">Kategorie specjalne *</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Wybierz typ wydarzenia. Wszystkie dotychczasowe typy zostały przeniesione do kart.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {EVENT_TYPES.map(type => {
              const visual = getEventVisual(type.id, type.name)
              const selected = eventTypeId === type.id
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => onEventTypeChange(type.id)}
                  className={cn(
                    'group min-h-36 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md',
                    selected ? 'border-accent ring-2 ring-orange-100' : 'border-sage-200',
                  )}
                >
                  <span
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-2xl transition-colors',
                      selected ? 'bg-accent text-white' : 'bg-sage-100 text-sage-500 group-hover:bg-orange-50 group-hover:text-accent',
                    )}
                  >
                    <visual.Icon className="h-6 w-6" />
                  </span>
                  <span className="block font-semibold text-primary">{visual.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{visual.description}</span>
                </button>
              )
            })}
          </div>

          <div className="rounded-2xl border border-sage-200 bg-sage-50 p-5 text-sm text-sage-700">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p>
                Typ wydarzenia wpływa na szablony formularza zapisów i pola dodatkowe dostępne w kroku rejestracji.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepLocationTime({
  venueName,
  location,
  lat,
  lng,
  startAt,
  endAt,
  duration,
  onVenueNameChange,
  onLocationChange,
  onStartAtChange,
  onEndAtChange,
}: {
  venueName: string
  location: string
  lat: number | null
  lng: number | null
  startAt: string | null
  endAt: string | null
  duration: string
  onVenueNameChange: (value: string) => void
  onLocationChange: (lat: number, lng: number, address: string) => void
  onStartAtChange: (value: string | null) => void
  onEndAtChange: (value: string | null) => void
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
      <div data-tutorial-id="event-location" className="rounded-3xl border border-sage-200 bg-white p-5 shadow-sm sm:p-7">
        <SectionHeader
          Icon={MapPin}
          eyebrow="Lokalizacja"
          title="Miejsce wydarzenia"
          description="Wpisz nazwę obiektu, wyszukaj adres lub ustaw pin bezpośrednio na mapie."
          compact
        />

        <div className="mt-6 space-y-5">
          <div>
            <label className="form-label">Nazwa obiektu</label>
            <input
              className="form-input min-h-12 bg-sage-50"
              value={venueName}
              onChange={e => onVenueNameChange(e.target.value)}
              placeholder="np. Stadion Miejski lub Park Narodowy"
            />
          </div>

          <div className="rounded-[28px] bg-primary p-3 shadow-sm">
            <div className="overflow-hidden rounded-3xl bg-white p-3">
              <MapPicker lat={lat} lng={lng} location={location} onLocationChange={onLocationChange} />
            </div>
          </div>
        </div>
      </div>

      <div data-tutorial-id="event-dates" className="rounded-3xl border border-sage-200 bg-white p-5 shadow-sm sm:p-7">
        <SectionHeader
          Icon={CalendarDays}
          eyebrow="Harmonogram"
          title="Data i czas"
          description="Start jest wymagany. Zakończenie zostaw puste, jeśli wydarzenie nie ma osobnej godziny końca."
          compact
        />

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="form-label">Data rozpoczęcia *</label>
            <DateTimePicker value={startAt} onChange={onStartAtChange} required placeholder="Wybierz datę startu" />
          </div>
          <div>
            <label className="form-label">Data zakończenia</label>
            <DateTimePicker value={endAt} onChange={onEndAtChange} placeholder="Opcjonalnie" />
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-sage-200 bg-sage-50 p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-accent shadow-sm">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-primary">Podgląd czasu trwania</p>
              <p className="mt-1 text-3xl font-heading font-bold text-accent">{duration}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Dla wydarzeń wielodniowych ustaw datę zakończenia. Dla spacerów lub zawodów jednodniowych wystarczy start.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-sage-200 bg-white p-4 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p>Włączenie grafiku startów oraz pola wieloterminowe znajdziesz w kroku rejestracji.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepRegistration({
  maxParticipants,
  registrationDeadline,
  entryFeeEnabled,
  entryFee,
  autoConfirm,
  hasSchedule,
  eventTypeId,
  selectedTemplateId,
  groupableFields,
  groupingField,
  formFieldsCount,
  onMaxParticipantsChange,
  onRegistrationDeadlineChange,
  onEntryFeeEnabledChange,
  onEntryFeeChange,
  onAutoConfirmChange,
  onHasScheduleChange,
  onTemplateSelect,
  onGroupingFieldChange,
}: {
  maxParticipants: string
  registrationDeadline: string | null
  entryFeeEnabled: boolean
  entryFee: string
  autoConfirm: boolean
  hasSchedule: boolean
  eventTypeId: string | null
  selectedTemplateId: string | null
  groupableFields: FormField[]
  groupingField: string
  formFieldsCount: number
  onMaxParticipantsChange: (value: string) => void
  onRegistrationDeadlineChange: (value: string | null) => void
  onEntryFeeEnabledChange: (checked: boolean) => void
  onEntryFeeChange: (value: string) => void
  onAutoConfirmChange: (checked: boolean) => void
  onHasScheduleChange: (checked: boolean) => void
  onTemplateSelect: (templateId: string | null, fields: FormField[]) => void
  onGroupingFieldChange: (value: string) => void
}) {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel Icon={Users} title="Limity uczestników" tutorialId="registration-limits">
          <label className="form-label uppercase tracking-[0.16em] text-sage-500">Całkowita liczba miejsc</label>
          <div className="relative">
            <input
              className="form-input min-h-14 pr-16 text-lg"
              type="number"
              min="1"
              placeholder="np. 50 (puste = bez limitu)"
              value={maxParticipants}
              onChange={e => onMaxParticipantsChange(e.target.value)}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-sage-500">
              psów
            </span>
          </div>
          <p className="mt-4 text-sm italic leading-6 text-muted-foreground">
            Po osiągnięciu limitu zapisy zostaną zablokowane przez istniejącą logikę backendu.
          </p>
        </Panel>

        <Panel Icon={CalendarDays} title="Terminy zapisów" tutorialId="registration-dates">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="form-label uppercase tracking-[0.16em] text-sage-500">Otwarcie zapisów</label>
              <div className="flex min-h-12 items-center rounded-xl border border-sage-200 bg-sage-50 px-3 text-sm text-sage-600">
                Po opublikowaniu wydarzenia
              </div>
            </div>
            <div>
              <label className="form-label uppercase tracking-[0.16em] text-sage-500">Zamknięcie zapisów</label>
              <DateTimePicker value={registrationDeadline} onChange={onRegistrationDeadlineChange} placeholder="Opcjonalnie" />
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-sage-200 bg-sage-50 p-4 text-sm leading-6 text-sage-700">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p>Po terminie zamknięcia zapisy zostaną automatycznie zablokowane.</p>
            </div>
          </div>
        </Panel>

        <Panel Icon={Wallet} title="Opłaty" tutorialId="registration-fees">
          <ToggleRow
            checked={entryFeeEnabled}
            onChange={onEntryFeeEnabledChange}
            title="Pobieraj wpisowe"
            description="Zachowuje istniejącą logikę wpisowego w PLN."
          />
          {entryFeeEnabled && (
            <div className="mt-5">
              <label className="form-label uppercase tracking-[0.16em] text-sage-500">Wpisowe (PLN) *</label>
              <div className="relative">
                <input
                  className="form-input min-h-14 pr-16 text-lg"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={entryFee}
                  onChange={e => onEntryFeeChange(e.target.value)}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-accent">
                  PLN
                </span>
              </div>
            </div>
          )}
        </Panel>

        <Panel Icon={ShieldCheck} title="Automatyzacja" tutorialId="registration-automation">
          <div className="space-y-3">
            <ToggleRow
              checked={autoConfirm}
              onChange={onAutoConfirmChange}
              title="Auto-potwierdzanie zapisów"
              description="System automatycznie zaakceptuje nowe zgłoszenia."
            />
            <ToggleRow
              checked={hasSchedule}
              onChange={onHasScheduleChange}
              title="Włącz grafik startów"
              description="Organizator będzie mógł przypisywać uczestnikom terminy startów."
            />
          </div>
        </Panel>
      </div>

      <div>
        <Panel Icon={FileText} title="Formularz zapisów" tutorialId="registration-form">
          <p className="mb-4 text-sm text-muted-foreground">
            Wybierz szablon pól dodatkowych albo utwórz nowy. Pola stałe uczestnika pozostają dostępne jak wcześniej.
          </p>
          <FormTemplatePicker
            eventTypeId={eventTypeId}
            selectedTemplateId={selectedTemplateId}
            onSelect={onTemplateSelect}
          />

          {groupableFields.length > 0 && (
            <div className="mt-5">
              <label className="form-label">Grupuj zapisy według</label>
              <select
                className="form-input"
                value={groupingField}
                onChange={e => onGroupingFieldChange(e.target.value)}
              >
                <option value="">Brak grupowania</option>
                {groupableFields.map(field => (
                  <option key={field.id} value={field.id}>{field.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">Listy zapisów będą pogrupowane według tego pola.</p>
            </div>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <MetricTile label="Pola formularza" value={String(formFieldsCount)} />
            <MetricTile label="Grupowanie" value={groupingField ? 'Tak' : 'Nie'} />
          </div>
        </Panel>
      </div>
    </div>
  )
}

function StepPreview({
  title,
  description,
  organizerName,
  imageUrl,
  selectedVisual,
  location,
  startAt,
  endAt,
  registrationDeadline,
  seatsLabel,
  feeLabel,
  autoConfirm,
  hasResults,
  resultsPublic,
  hasSchedule,
  galleryCount,
  formFieldsCount,
  groupingEnabled,
}: {
  title: string
  description: string
  organizerName: string
  imageUrl: string | null
  selectedVisual: EventVisual | null
  location: string
  startAt: string | null
  endAt: string | null
  registrationDeadline: string | null
  seatsLabel: string
  feeLabel: string
  autoConfirm: boolean
  hasResults: boolean
  resultsPublic: boolean
  hasSchedule: boolean
  galleryCount: number
  formFieldsCount: number
  groupingEnabled: boolean
}) {
  const VisualIcon = selectedVisual?.Icon ?? PawPrint

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div data-tutorial-id="event-preview" className="space-y-6">
        <div className="relative min-h-[360px] overflow-hidden rounded-[28px] bg-primary shadow-sm">
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill className="object-cover" unoptimized />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,128,36,0.35),transparent_28%),linear-gradient(135deg,#1E3932,#10231f)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-primary/10" />
          <div className="absolute inset-0 flex flex-col justify-end p-6 text-white sm:p-10">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-bold uppercase tracking-[0.16em]">
                <VisualIcon className="h-4 w-4" />
                {selectedVisual?.label ?? 'Typ wydarzenia'}
              </span>
              <span className="inline-flex rounded-full bg-white/15 px-4 py-2 text-sm backdrop-blur">
                Limit: {seatsLabel}
              </span>
            </div>
            <h2 className="max-w-3xl text-4xl font-heading font-bold leading-tight sm:text-6xl">
              {title || 'Nazwa wydarzenia'}
            </h2>
            {description && (
              <p className="mt-4 max-w-3xl text-lg leading-8 text-white/90">{description}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SummaryTile Icon={CalendarDays} label="Data i czas" value={formatDateTime(startAt)} detail={endAt ? `Do: ${formatDateTime(endAt)}` : 'Bez osobnej daty zakończenia'} accent />
          <SummaryTile Icon={MapPin} label="Lokalizacja" value={location} detail={organizerName ? `Organizator: ${organizerName}` : 'Organizator nieuzupełniony'} />
          <SummaryTile Icon={Wallet} label="Koszt uczestnictwa" value={feeLabel} detail={autoConfirm ? 'Zapisy auto-potwierdzane' : 'Zapisy wymagają akceptacji'} />
          <SummaryTile Icon={Clock} label="Zapisy do" value={registrationDeadline ? formatDateTime(registrationDeadline) : 'Bez terminu'} detail="Po terminie zapisy zostaną zamknięte" />
        </div>

        <div className="rounded-3xl border border-sage-200 bg-white p-6 shadow-sm">
          <h2 className="section-title">Wymagania i ustawienia</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile label="Formularz" value={`${formFieldsCount} pól`} />
            <MetricTile label="Galeria" value={`${galleryCount} zdjęć`} />
            <MetricTile label="Grafik startów" value={hasSchedule ? 'Włączony' : 'Wyłączony'} />
            <MetricTile label="Grupowanie" value={groupingEnabled ? 'Włączone' : 'Brak'} />
            <MetricTile label="Wyniki" value={hasResults ? 'Włączone' : 'Wyłączone'} />
            <MetricTile
              label="Widok live"
              value={getLiveVisibilityLabel(hasResults, resultsPublic)}
            />
          </div>
        </div>
      </div>

      <aside data-tutorial-id="event-publish" className="h-fit rounded-3xl border border-sage-200 bg-white p-6 shadow-sm xl:sticky xl:top-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
            <Rocket className="h-5 w-5" />
          </span>
          <div>
            <h2 className="section-title mb-0">Finalizacja</h2>
            <p className="text-sm text-muted-foreground">Ostatni przegląd przed publikacją.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Informacja prawna</p>
          <p className="mt-3 text-sm leading-6 text-sage-700">
            Publikując wydarzenie, potwierdzasz, że posiadasz uprawnienia do jego organizacji i akceptujesz regulamin platformy Dogdex.
          </p>
          <p className="mt-3 text-sm leading-6 text-sage-700">
            Jeśli nie chcesz jeszcze publikować wydarzenia, zapisz je jako szkic. Będzie widoczne tylko w panelu organizatora.
          </p>
        </div>
      </aside>
    </div>
  )
}

function SectionHeader({
  Icon,
  eyebrow,
  title,
  description,
  compact,
}: {
  Icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  compact?: boolean
}) {
  return (
    <div className={cn('flex gap-4', compact ? 'items-start' : 'items-center')}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-accent">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage-500">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-heading font-bold text-primary">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function Panel({
  Icon,
  title,
  children,
  tutorialId,
}: {
  Icon: LucideIcon
  title: string
  children: React.ReactNode
  tutorialId?: string
}) {
  return (
    <section data-tutorial-id={tutorialId} className="rounded-3xl border border-sage-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6 flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-accent">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="section-title mb-0">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function ToggleRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-colors',
        checked ? 'border-accent bg-orange-50/70' : 'border-sage-200 bg-sage-50 hover:border-sage-300',
      )}
    >
      <span>
        <span className="block font-semibold text-primary">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          'relative h-8 w-14 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-sage-300',
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-7' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-sage-200 bg-sage-50 p-4 text-center">
      <p className="text-xs uppercase tracking-[0.16em] text-sage-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-primary">{value}</p>
    </div>
  )
}

function SummaryTile({
  Icon,
  label,
  value,
  detail,
  accent,
}: {
  Icon: LucideIcon
  label: string
  value: string
  detail: string
  accent?: boolean
}) {
  return (
    <div className={cn('rounded-3xl border bg-white p-5 shadow-sm', accent ? 'border-accent' : 'border-sage-200')}>
      <div className="flex gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-accent">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage-500">{label}</p>
          <p className="mt-1 text-lg font-bold text-primary wrap-anywhere">{value}</p>
          <p className="mt-1 text-sm text-muted-foreground wrap-anywhere">{detail}</p>
        </div>
      </div>
    </div>
  )
}
