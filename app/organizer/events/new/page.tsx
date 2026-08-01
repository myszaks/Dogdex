'use client'

import { useEffect, useMemo, useState } from 'react'
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
  LoaderCircle,
  MapPin,
  PawPrint,
  Rocket,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import FormTemplatePicker from '@/components/FormTemplatePicker'
import FormBuilder from '@/components/FormBuilder'
import EventCreatorTutorial from '@/components/EventCreatorTutorial'
import EventResultsSetup from '@/components/EventResultsSetup'
import ImageCropUploader from '@/components/ImageCropUploader'
import DateTimePicker from '@/components/DateTimePicker'
import GalleryUploader from '@/components/GalleryUploader'
import EventPricingEditor from '@/components/EventPricingEditor'
import { EVENT_TYPES } from '@/lib/eventTypes'
import { validateCompetitionFieldValues } from '@/lib/competitionEngine'
import { validateFormFieldDefinitions } from '@/lib/registrationFormValidation'
import {
  ensureEventTypeRegistrationDependencies,
  hasDogHeightRegistrationSource,
  hasSpeedwaySighthoundRegistrationSource,
  hasSpeedwaySportRegistrationSource,
  validateEventCompetitionDependencies,
} from '@/lib/eventCompetitionDependencies'
import { SPEEDWAY_CLASS_GROUPING_FIELD } from '@/lib/speedway'
import { getLiveVisibilityLabel } from '@/lib/eventCompetitionSetup'
import { cn } from '@/lib/utils'
import { formatPolishCount, POLISH_FORMS } from '@/lib/polish'
import {
  isPreselectedFormatBlocking,
  type PreselectedFormatStatus,
} from '@/lib/eventCreatorFormatSelection'
import type { FormField } from '@/types'
import { validateEventPricing, type EventDatePrices, type EventPricingMode } from '@/lib/eventPricing'
import type { CompetitionFormatDefinition, CompetitionScalar } from '@/types/competition'

const MapPicker = dynamic(() => import('@/components/MapPicker'), {
  ssr: false,
  loading: () => <div className="w-full h-64 rounded-2xl bg-sage-100 animate-pulse" />,
})

const STEPS = [
  { label: 'Podstawowe informacje', shortLabel: 'Informacje', Icon: FileText },
  { label: 'Lokalizacja i czas', shortLabel: 'Lokalizacja', Icon: MapPin },
  { label: 'Rejestracja i limity', shortLabel: 'Rejestracja', Icon: Users },
  { label: 'Wyniki', shortLabel: 'Wyniki', Icon: Trophy },
  { label: 'Podgląd i publikacja', shortLabel: 'Podgląd', Icon: Eye },
]

const CREATOR_ERROR_ID = 'event-creator-validation-error'

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
  return formatPolishCount(days, POLISH_FORMS.day)
}

export default function NewEventPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [savingMode, setSavingMode] = useState<'draft' | 'publish' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorFieldId, setErrorFieldId] = useState<string | null>(null)
  const [tutorialSession, setTutorialSession] = useState(0)
  const [preselectedFormatName, setPreselectedFormatName] = useState<string | null>(null)
  const [preselectedFormatStatus, setPreselectedFormatStatus] =
    useState<PreselectedFormatStatus>('checking')
  const [preselectedFormatError, setPreselectedFormatError] = useState<string | null>(null)
  const [preselectedFormatRetry, setPreselectedFormatRetry] = useState(0)

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
  const [pricingMode, setPricingMode] = useState<EventPricingMode>('free')
  const [datePrices, setDatePrices] = useState<EventDatePrices>({})
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

  useEffect(() => {
    const formatId = new URLSearchParams(window.location.search).get('competitionFormatId')
    if (!formatId) {
      let active = true
      queueMicrotask(() => {
        if (active) setPreselectedFormatStatus('idle')
      })
      return () => {
        active = false
      }
    }

    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setPreselectedFormatStatus('loading')
        setPreselectedFormatError(null)
      }
    })
    fetch(`/api/competition-formats/${formatId}`, { signal: controller.signal })
      .then(async response => {
        const json = await response.json()
        if (!response.ok) throw new Error(json.error ?? 'Nie udało się pobrać formatu.')
        if (json.status !== 'published') {
          throw new Error('Do nowego wydarzenia można przypisać tylko opublikowany format.')
        }
        setHasResults(true)
        setCompetitionFormatId(json.id)
        setCompetitionDefinition(json.definition as CompetitionFormatDefinition)
        setCompetitionValues({})
        setPreselectedFormatName(`${json.name} · wersja ${json.version}`)
        setPreselectedFormatStatus('ready')
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return
        setPreselectedFormatStatus('error')
        setPreselectedFormatError(loadError instanceof Error
          ? loadError.message
          : 'Nie udało się pobrać wybranego formatu.')
      })

    return () => controller.abort()
  }, [preselectedFormatRetry])

  const selectedType = EVENT_TYPES.find(t => t.id === eventTypeId)
  const selectedVisual = selectedType ? getEventVisual(selectedType.id, selectedType.name) : null
  const groupableFields = useMemo(
    () => formFields.filter(f => ['select', 'multiselect', 'multidate', 'checkbox'].includes(f.type)),
    [formFields],
  )
  const locationSummary = [venueName.trim(), location.trim()].filter(Boolean).join(', ')
  const visibleLocation = locationSummary || 'Lokalizacja do uzupełnienia'
  const seatsLabel = maxParticipants ? `${maxParticipants} miejsc` : 'Bez limitu miejsc'
  const feeLabel = pricingMode === 'flat'
    ? formatMoney(entryFee)
    : pricingMode === 'per_date'
      ? 'Cena za wybrane terminy'
      : 'Bezpłatne'
  const preselectedFormatBlocking =
    isPreselectedFormatBlocking(preselectedFormatStatus)

  useEffect(() => {
    if (!error) return
    const target = errorFieldId
      ? document.getElementById(errorFieldId)
      : document.getElementById(CREATOR_ERROR_ID)
    target?.focus({ preventScroll: false })
  }, [currentStep, error, errorFieldId])

  function clearCreatorError(fieldId?: string) {
    if (fieldId && errorFieldId && errorFieldId !== fieldId) return
    setError(null)
    setErrorFieldId(null)
  }

  function showCreatorError(message: string, fieldId?: string) {
    setError(message)
    setErrorFieldId(fieldId ?? null)
  }

  function handleEventTypeChange(id: string) {
    setEventTypeId(id)
    setSelectedTemplateId(null)
    setFormFields(ensureEventTypeRegistrationDependencies(id, []))
    setGroupingField(id === 'speedway' ? SPEEDWAY_CLASS_GROUPING_FIELD : '')
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
    const compatibleFields = ensureEventTypeRegistrationDependencies(eventTypeId, fields)
    setSelectedTemplateId(templateId)
    setFormFields(compatibleFields)
    if (
      groupingField !== SPEEDWAY_CLASS_GROUPING_FIELD
      && !compatibleFields.some(f => f.id === groupingField)
    ) setGroupingField('')
  }

  function handleMapLocation(newLat: number, newLng: number, address: string) {
    setLat(newLat)
    setLng(newLng)
    setLocation(address)
  }

  function validateStep(step: number) {
    clearCreatorError()

    if (step === 0) {
      if (!eventTypeId) {
        showCreatorError('Wybierz typ wydarzenia.', 'event-type-options')
        return false
      }
      if (!title.trim()) {
        showCreatorError('Podaj nazwę wydarzenia.', 'event-title')
        return false
      }
    }

    if (step === 1) {
      if (!startAt) {
        showCreatorError('Wybierz datę rozpoczęcia wydarzenia.', 'event-start-at')
        return false
      }
      if (startAt && endAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
        showCreatorError(
          'Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.',
          'event-end-at',
        )
        return false
      }
    }

    if (step === 2) {
      const formIssues = validateFormFieldDefinitions(formFields)
      if (formIssues.length > 0) {
        showCreatorError(formIssues[0].message, 'registration-form')
        return false
      }
      const pricingError = validateEventPricing({
        title: title || 'Wydarzenie',
        pricing_mode: pricingMode,
        entry_fee: entryFee ? Number(entryFee) : null,
        date_prices: datePrices,
        currency: 'PLN',
        form_fields: formFields,
      })
      if (pricingError) {
        showCreatorError(pricingError, 'event-entry-fee')
        return false
      }
    }

    if (step === 3 && hasResults && competitionDefinition) {
      const dependencyIssues = validateEventCompetitionDependencies(
        formFields,
        competitionDefinition,
      )
      if (dependencyIssues.length > 0) {
        showCreatorError(`${dependencyIssues[0].message} Wróć do kroku rejestracji, aby poprawić formularz.`)
        return false
      }
      const valueIssues = validateCompetitionFieldValues(
        competitionDefinition.eventFields,
        competitionValues,
      )
      if (valueIssues.length > 0) {
        const field = competitionDefinition.eventFields.find(candidate =>
          valueIssues[0].path.includes(candidate.id)
        )
        showCreatorError(
          field
            ? `Uzupełnij pole „${field.label}” w ustawieniach wyników.`
            : valueIssues[0].message,
          field ? `competition-event-field-${field.id}` : undefined,
        )
        return false
      }
    }

    return true
  }

  function goToStep(nextStep: number) {
    if (preselectedFormatBlocking) return
    if (nextStep === currentStep) return
    if (nextStep < currentStep) {
      clearCreatorError()
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
    if (preselectedFormatBlocking) return
    if (!validateStep(currentStep)) return
    setCurrentStep(step => Math.min(STEPS.length - 1, step + 1))
  }

  function goBack() {
    clearCreatorError()
    if (currentStep === 0) {
      router.back()
      return
    }
    setCurrentStep(step => Math.max(0, step - 1))
  }

  async function saveEvent(status: 'draft' | 'upcoming') {
    if (preselectedFormatBlocking) return
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
    clearCreatorError()

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
      pricing_mode: pricingMode,
      date_prices: datePrices,
      currency: 'PLN',
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
      showCreatorError(err instanceof Error ? err.message : 'Nieznany błąd')
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
          <h1 className="mt-2 text-4xl font-heading font-bold text-primary">Kreator wydarzenia</h1>
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
          <div className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm text-sage-600 shadow-sm">
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

      {preselectedFormatStatus === 'loading' && (
        <div
          role="status"
          className="flex gap-3 rounded-2xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-800"
        >
          <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-accent" />
          <p>
            <strong>Ładuję wybrany format wyników…</strong>
            {' '}Możesz uzupełniać ten krok. Przejście dalej odblokuje się po bezpiecznym
            przypięciu formatu.
          </p>
        </div>
      )}

      {preselectedFormatStatus === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex gap-3">
            <Trophy className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              <strong>Nie udało się przypiąć formatu.</strong>
              {' '}{preselectedFormatError}
              {' '}Kreator nie pozwoli zapisać wydarzenia bez rozstrzygnięcia tego błędu.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreselectedFormatRetry(value => value + 1)}
              className="btn btn-secondary btn-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Spróbuj ponownie
            </button>
            <button
              type="button"
              onClick={() => router.push('/organizer/formats')}
              className="btn btn-secondary btn-sm"
            >
              Wróć do formatów
            </button>
          </div>
        </div>
      )}

      {preselectedFormatStatus === 'ready' && preselectedFormatName && (
        <div className="flex gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <Trophy className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Format <strong>{preselectedFormatName}</strong> jest już przypięty.
            Uzupełnij wydarzenie od początku; ustawienia klasyfikacji znajdziesz w kroku „Wyniki”.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <WizardStepper
          currentStep={currentStep}
          onStepChange={goToStep}
          disabled={preselectedFormatBlocking}
        />

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
              errorFieldId={errorFieldId}
              errorMessageId={CREATOR_ERROR_ID}
              onTitleChange={value => {
                setTitle(value)
                if (value.trim()) clearCreatorError('event-title')
              }}
              onOrganizerNameChange={setOrganizerName}
              onDescriptionChange={setDescription}
              onEventTypeChange={value => {
                handleEventTypeChange(value)
                clearCreatorError('event-type-options')
              }}
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
              errorFieldId={errorFieldId}
              errorMessageId={CREATOR_ERROR_ID}
              onVenueNameChange={setVenueName}
              onLocationChange={handleMapLocation}
              onStartAtChange={value => {
                setStartAt(value)
                if (
                  value
                  && (!endAt || new Date(endAt).getTime() >= new Date(value).getTime())
                  && (errorFieldId === 'event-start-at' || errorFieldId === 'event-end-at')
                ) clearCreatorError()
              }}
              onEndAtChange={value => {
                setEndAt(value)
                if (
                  !value
                  || !startAt
                  || new Date(value).getTime() >= new Date(startAt).getTime()
                ) clearCreatorError('event-end-at')
              }}
            />
          )}

          {currentStep === 2 && (
            <StepRegistration
              maxParticipants={maxParticipants}
              registrationDeadline={registrationDeadline}
              entryFee={entryFee}
              pricingMode={pricingMode}
              datePrices={datePrices}
              autoConfirm={autoConfirm}
              hasSchedule={hasSchedule}
              eventTypeId={eventTypeId || null}
              selectedTemplateId={selectedTemplateId}
              groupableFields={groupableFields}
              groupingField={groupingField}
              formFieldsCount={formFields.length}
              formFields={formFields}
              errorFieldId={errorFieldId}
              errorMessageId={CREATOR_ERROR_ID}
              onMaxParticipantsChange={setMaxParticipants}
              onRegistrationDeadlineChange={setRegistrationDeadline}
              onEntryFeeChange={value => {
                setEntryFee(value)
                if (value.trim()) clearCreatorError('event-entry-fee')
              }}
              onPricingModeChange={mode => {
                setPricingMode(mode)
                setEntryFeeEnabled(mode !== 'free')
                if (mode === 'free') setEntryFee('')
              }}
              onDatePricesChange={setDatePrices}
              onAutoConfirmChange={setAutoConfirm}
              onHasScheduleChange={setHasSchedule}
              onTemplateSelect={handleTemplateSelect}
              onFormFieldsChange={fields => {
                setFormFields(fields)
                if (
                  groupingField !== SPEEDWAY_CLASS_GROUPING_FIELD
                  && !fields.some(field => field.id === groupingField)
                ) setGroupingField('')
              }}
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
              errorFieldId={errorFieldId}
              errorMessageId={CREATOR_ERROR_ID}
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
              competitionName={competitionDefinition?.name ?? null}
              resultsPublic={resultsPublic}
              hasSchedule={hasSchedule}
              galleryCount={galleryImages.length}
              formFieldsCount={formFields.length}
              groupingEnabled={Boolean(groupingField)}
            />
          )}
        </div>

        {error && (
          <div
            id={CREATOR_ERROR_ID}
            role="alert"
            tabIndex={-1}
            className="mx-5 mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 outline-none focus:ring-2 focus:ring-red-400 sm:mx-8 lg:mx-10"
          >
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
            <button
              type="button"
              onClick={goNext}
              disabled={preselectedFormatBlocking}
              className="btn btn-primary min-h-12 px-8 shadow-primary/10"
            >
              Dalej
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => saveEvent('draft')} disabled={loading || preselectedFormatBlocking} className="btn btn-secondary min-h-12 px-8">
                {loading && savingMode === 'draft' ? 'Zapisywanie...' : 'Zapisz jako szkic'}
              </button>
              <button type="button" onClick={() => saveEvent('upcoming')} disabled={loading || preselectedFormatBlocking} className="btn btn-primary min-h-12 px-8 shadow-primary/10">
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
  disabled = false,
}: {
  currentStep: number
  onStepChange: (step: number) => void
  disabled?: boolean
}) {
  return (
    <div className="border-b border-sage-200 bg-white px-3 py-4 sm:px-8 lg:px-10">
      <div className="grid grid-cols-5 gap-1 sm:gap-2">
        {STEPS.map(({ label, shortLabel, Icon }, index) => {
          const active = index === currentStep
          const complete = index < currentStep

          return (
            <button
              key={label}
              type="button"
              onClick={() => onStepChange(index)}
              disabled={disabled}
              className="group flex min-w-0 flex-col items-center gap-1 rounded-2xl p-1 text-center transition-colors hover:bg-sage-50 sm:flex-row sm:gap-2 sm:p-2 sm:text-left"
              title={label}
              aria-label={`Krok ${index + 1}: ${label}`}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors sm:h-10 sm:w-10',
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
                    'hidden text-[10px] font-bold uppercase tracking-[0.12em] sm:block',
                    active ? 'text-accent' : complete ? 'text-primary' : 'text-sage-400',
                  )}
                >
                  Krok {index + 1}
                </span>
                <span className={cn('block max-w-full truncate text-[10px] font-semibold sm:text-xs lg:text-sm', active ? 'text-primary' : 'text-sage-500')}>
                  <span>{shortLabel}</span>
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
  errorFieldId,
  errorMessageId,
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
  errorFieldId: string | null
  errorMessageId: string
  onTitleChange: (value: string) => void
  onOrganizerNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onEventTypeChange: (value: string) => void
  onImageUrlChange: (url: string | null) => void
  onGalleryImagesChange: (urls: string[]) => void
}) {
  const activeEventType = EVENT_TYPES.find(type => type.id === eventTypeId)
  const activeEventVisual = activeEventType
    ? getEventVisual(activeEventType.id, activeEventType.name)
    : null

  return (
    <div className="space-y-8">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-8">
          <SectionHeader
            Icon={FileText}
            eyebrow="Najważniejsze informacje"
            title="Co organizujesz?"
            description="Najpierw podaj nazwę i wybierz rodzaj wydarzenia. Zdjęcia są opcjonalne i możesz dodać je później."
          />

          <div data-tutorial-id="event-details" className="space-y-5">
            <div>
              <label htmlFor="event-title" className="form-label uppercase tracking-[0.16em] text-sage-500">Nazwa wydarzenia *</label>
              <input
                id="event-title"
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
                aria-invalid={errorFieldId === 'event-title' ? true : undefined}
                aria-describedby={errorFieldId === 'event-title' ? errorMessageId : undefined}
              />
            </div>

            <div>
              <label htmlFor="event-organizer-name" className="form-label uppercase tracking-[0.16em] text-sage-500">Organizator</label>
              <input
                id="event-organizer-name"
                className="form-input min-h-12 bg-sage-50"
                name="organizer_name"
                value={organizerName}
                onChange={e => onOrganizerNameChange(e.target.value)}
                placeholder="Imię i nazwisko lub nazwa klubu"
              />
            </div>

            <div>
              <label htmlFor="event-description" className="form-label uppercase tracking-[0.16em] text-sage-500">Opis wydarzenia</label>
              <textarea
                id="event-description"
                className="form-input min-h-36 bg-sage-50 text-base leading-7"
                name="description"
                value={description}
                onChange={e => onDescriptionChange(e.target.value)}
                placeholder="Napisz, dla kogo jest wydarzenie i czego uczestnicy mogą się spodziewać..."
              />
            </div>
          </div>
        </div>

        <div data-tutorial-id="event-type" className="space-y-4">
          <div>
            <p className="form-label uppercase tracking-[0.16em] text-sage-500">Rodzaj wydarzenia *</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Wybór podpowie pasujące formularze i sposoby liczenia wyników.
            </p>
          </div>

          <div
            id="event-type-options"
            role="radiogroup"
            aria-label="Rodzaj wydarzenia"
            aria-invalid={errorFieldId === 'event-type-options' ? true : undefined}
            aria-describedby={errorFieldId === 'event-type-options' ? errorMessageId : undefined}
            tabIndex={errorFieldId === 'event-type-options' ? -1 : undefined}
            className="grid grid-cols-2 gap-2 outline-none focus:ring-2 focus:ring-accent/60 sm:grid-cols-3 xl:grid-cols-2"
          >
            {EVENT_TYPES.map((type, index) => {
              const visual = getEventVisual(type.id, type.name)
              const selected = eventTypeId === type.id
              return (
                <button
                  key={type.id}
                  id={`event-type-${type.id}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected || (!eventTypeId && index === 0) ? 0 : -1}
                  onClick={() => onEventTypeChange(type.id)}
                  onKeyDown={event => {
                    if (event.key === 'Home' || event.key === 'End') {
                      event.preventDefault()
                      const nextType = event.key === 'Home'
                        ? EVENT_TYPES[0]
                        : EVENT_TYPES[EVENT_TYPES.length - 1]
                      onEventTypeChange(nextType.id)
                      document.getElementById(`event-type-${nextType.id}`)?.focus()
                      return
                    }
                    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown'
                      ? 1
                      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                        ? -1
                        : 0
                    if (direction === 0) return
                    event.preventDefault()
                    const nextIndex = (index + direction + EVENT_TYPES.length) % EVENT_TYPES.length
                    const nextType = EVENT_TYPES[nextIndex]
                    onEventTypeChange(nextType.id)
                    document.getElementById(`event-type-${nextType.id}`)?.focus()
                  }}
                  className={cn(
                    'group flex min-h-14 items-center gap-2.5 rounded-xl border bg-white p-2.5 text-left shadow-sm transition-all hover:border-accent hover:shadow-md',
                    selected ? 'border-accent ring-2 ring-orange-100' : 'border-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                      selected ? 'bg-accent text-white' : 'bg-sage-100 text-sage-500 group-hover:bg-orange-50 group-hover:text-accent',
                    )}
                  >
                    <visual.Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold text-primary">{visual.label}</span>
                </button>
              )
            })}
          </div>

          <div className="rounded-2xl border border-sage-200 bg-sage-50 p-4 text-sm text-sage-700">
            <div className="flex gap-3">
              {activeEventVisual ? (
                <activeEventVisual.Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              )}
              <p>
                {activeEventVisual
                  ? activeEventVisual.description
                  : 'Typ wydarzenia wpływa na formularz zapisów i podpowiadany sposób liczenia.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <details
        data-tutorial-id="event-cover"
        className="group rounded-3xl border border-sage-200 bg-sage-50/40"
      >
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-accent shadow-sm">
              <ImagePlus className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-primary">Zdjęcia wydarzenia <span className="font-normal text-sage-500">(opcjonalnie)</span></p>
              <p className="text-sm text-muted-foreground">Dodaj okładkę i galerię, jeśli masz już materiały.</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-sage-500 transition-transform group-open:rotate-90" />
        </summary>
        <div className="grid gap-6 border-t border-sage-200 p-5 sm:p-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-sm font-semibold text-primary">Zdjęcie główne</p>
            <div className="rounded-3xl border-2 border-dashed border-sage-200 bg-white p-3">
              <ImageCropUploader currentUrl={imageUrl} onUrlChange={onImageUrlChange} />
            </div>
          </div>
          <div>
            <div className="mb-3 flex items-center gap-2">
              <GalleryHorizontal className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-primary">Galeria</p>
            </div>
            <div className="rounded-3xl border border-sage-200 bg-white p-4">
              <GalleryUploader images={galleryImages} onImagesChange={onGalleryImagesChange} />
            </div>
          </div>
        </div>
      </details>
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
  errorFieldId,
  errorMessageId,
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
  errorFieldId: string | null
  errorMessageId: string
  onVenueNameChange: (value: string) => void
  onLocationChange: (lat: number, lng: number, address: string) => void
  onStartAtChange: (value: string | null) => void
  onEndAtChange: (value: string | null) => void
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
      <div data-tutorial-id="event-location" className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
        <SectionHeader
          Icon={MapPin}
          eyebrow="Lokalizacja"
          title="Miejsce wydarzenia"
          description="Wpisz nazwę obiektu, wyszukaj adres lub ustaw pin bezpośrednio na mapie."
          compact
        />

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="event-venue-name" className="form-label">Nazwa obiektu</label>
            <input
              id="event-venue-name"
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

      <div data-tutorial-id="event-dates" className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
        <SectionHeader
          Icon={CalendarDays}
          eyebrow="Harmonogram"
          title="Data i czas"
          description="Start jest wymagany. Zakończenie zostaw puste, jeśli wydarzenie nie ma osobnej godziny końca."
          compact
        />

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="event-start-at" className="form-label">Data rozpoczęcia *</label>
            <DateTimePicker
              id="event-start-at"
              value={startAt}
              onChange={onStartAtChange}
              required
              placeholder="Wybierz datę startu"
              invalid={errorFieldId === 'event-start-at'}
              describedBy={errorFieldId === 'event-start-at' ? errorMessageId : undefined}
            />
          </div>
          <div>
            <label htmlFor="event-end-at" className="form-label">Data zakończenia</label>
            <DateTimePicker
              id="event-end-at"
              value={endAt}
              onChange={onEndAtChange}
              placeholder="Opcjonalnie"
              invalid={errorFieldId === 'event-end-at'}
              describedBy={errorFieldId === 'event-end-at' ? errorMessageId : undefined}
            />
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
  entryFee,
  pricingMode,
  datePrices,
  autoConfirm,
  hasSchedule,
  eventTypeId,
  selectedTemplateId,
  groupableFields,
  groupingField,
  formFieldsCount,
  formFields,
  errorFieldId,
  errorMessageId,
  onMaxParticipantsChange,
  onRegistrationDeadlineChange,
  onEntryFeeChange,
  onPricingModeChange,
  onDatePricesChange,
  onAutoConfirmChange,
  onHasScheduleChange,
  onTemplateSelect,
  onFormFieldsChange,
  onGroupingFieldChange,
}: {
  maxParticipants: string
  registrationDeadline: string | null
  entryFee: string
  pricingMode: EventPricingMode
  datePrices: EventDatePrices
  autoConfirm: boolean
  hasSchedule: boolean
  eventTypeId: string | null
  selectedTemplateId: string | null
  groupableFields: FormField[]
  groupingField: string
  formFieldsCount: number
  formFields: FormField[]
  errorFieldId: string | null
  errorMessageId: string
  onMaxParticipantsChange: (value: string) => void
  onRegistrationDeadlineChange: (value: string | null) => void
  onEntryFeeChange: (value: string) => void
  onPricingModeChange: (mode: EventPricingMode) => void
  onDatePricesChange: (value: EventDatePrices) => void
  onAutoConfirmChange: (checked: boolean) => void
  onHasScheduleChange: (checked: boolean) => void
  onTemplateSelect: (templateId: string | null, fields: FormField[]) => void
  onFormFieldsChange: (fields: FormField[]) => void
  onGroupingFieldChange: (value: string) => void
}) {
  const speedwayDependencyReady = eventTypeId !== 'speedway'
    || (
      hasDogHeightRegistrationSource(formFields)
      && hasSpeedwaySportRegistrationSource(formFields)
      && hasSpeedwaySighthoundRegistrationSource(formFields)
    )

  return (
    <div className="space-y-8">
      <Panel
        Icon={FileText}
        title="Formularz zapisów"
        tutorialId="registration-form"
        invalid={errorFieldId === 'registration-form'}
        errorMessageId={errorMessageId}
      >
        <p className="mb-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Dane właściciela i psa są dodawane automatycznie. Poniżej możesz od razu ustawić wszystkie pytania potrzebne przy tym wydarzeniu.
        </p>
        {eventTypeId === 'speedway' && (
          <div className={`mb-5 flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed ${
            speedwayDependencyReady
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}>
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              {speedwayDependencyReady ? (
                <>
                  <strong>Zależność Speedway zabezpieczona:</strong> formularz zawiera wymagane źródło klasy:
                  wzrost psa oraz opcjonalne klasy Sport i Charty.
                </>
              ) : (
                <>
                  <strong>Uzupełnij źródła klas Speedway:</strong> potrzebne są pola wzrostu, klasy Sport i klasy Chartów.
                </>
              )}
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-sage-200 bg-sage-50/40 p-4 sm:p-5">
          <div className="mb-4">
            <p className="font-semibold text-primary">Pytania w tym wydarzeniu</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Możesz zmienić nazwę, typ, wymaganie i opcje każdego pytania — także dodanego automatycznie.
            </p>
          </div>
          <FormBuilder
            value={formFields}
            onChange={onFormFieldsChange}
            eventTypeId={eventTypeId}
            hideTemplateActions
          />
        </div>

        <details className="group mt-5 rounded-2xl border border-sage-200 bg-white">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-primary marker:hidden">
            <span>{selectedTemplateId ? 'Zmień wybrany schemat formularza' : 'Użyj zapisanego schematu (opcjonalnie)'}</span>
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-sage-200 p-4">
            <FormTemplatePicker
              eventTypeId={eventTypeId}
              selectedTemplateId={selectedTemplateId}
              onSelect={onTemplateSelect}
            />
          </div>
        </details>

        <div className="mt-5 rounded-2xl border border-sage-200 bg-sage-50/60 p-4">
          <label htmlFor="event-registration-grouping" className="form-label">Grupowanie listy zapisów</label>
          <select
            id="event-registration-grouping"
            className="form-input min-h-11"
            value={groupingField}
            onChange={e => onGroupingFieldChange(e.target.value)}
            aria-describedby="event-registration-grouping-help"
          >
            <option value="">Bez grupowania — jedna lista</option>
            {eventTypeId === 'speedway' && (
              <option value={SPEEDWAY_CLASS_GROUPING_FIELD}>
                Klasa startowa Speedway (polecane)
              </option>
            )}
            {groupableFields.map(field => (
              <option key={field.id} value={field.id}>Odpowiedź: {field.label}</option>
            ))}
          </select>
          <p id="event-registration-grouping-help" className="mt-2 text-xs leading-5 text-slate-500">
            To ustawienie zmienia widok listy zapisów organizatora. Nie zmienia sposobu liczenia rankingu.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <MetricTile label="Pytania dodatkowe" value={String(formFieldsCount)} />
          <MetricTile
            label="Grupowanie"
            value={
              groupingField === SPEEDWAY_CLASS_GROUPING_FIELD
                ? 'Klasa Speedway'
                : groupingField ? 'Własne pole' : 'Nie'
            }
          />
        </div>
      </Panel>

      <div>
        <SectionHeader
          Icon={ShieldCheck}
          eyebrow="Ustawienia zapisów"
          title="Limity, terminy i automatyzacja"
          description="Te opcje są niezależne od pytań w formularzu i możesz wrócić do nich później."
          compact
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel Icon={Users} title="Limity uczestników" tutorialId="registration-limits">
          <label htmlFor="event-max-participants" className="form-label uppercase tracking-[0.16em] text-sage-500">Całkowita liczba miejsc</label>
          <div className="relative">
            <input
              id="event-max-participants"
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
              <p className="form-label uppercase tracking-[0.16em] text-sage-500">Otwarcie zapisów</p>
              <div className="flex min-h-12 items-center rounded-xl border border-sage-200 bg-sage-50 px-3 text-sm text-sage-600">
                Po opublikowaniu wydarzenia
              </div>
            </div>
            <div>
              <label htmlFor="event-registration-deadline" className="form-label uppercase tracking-[0.16em] text-sage-500">Zamknięcie zapisów</label>
              <DateTimePicker
                id="event-registration-deadline"
                value={registrationDeadline}
                onChange={onRegistrationDeadlineChange}
                placeholder="Opcjonalnie"
              />
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
          <EventPricingEditor
            pricingMode={pricingMode}
            entryFee={entryFee}
            datePrices={datePrices}
            formFields={formFields}
            onPricingModeChange={onPricingModeChange}
            onEntryFeeChange={onEntryFeeChange}
            onDatePricesChange={onDatePricesChange}
          />
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
  competitionName,
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
  competitionName: string | null
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

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="section-title">Wymagania i ustawienia</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile label="Formularz" value={formatPolishCount(formFieldsCount, POLISH_FORMS.field)} />
            <MetricTile label="Galeria" value={`${galleryCount} zdjęć`} />
            <MetricTile label="Grafik startów" value={hasSchedule ? 'Włączony' : 'Wyłączony'} />
            <MetricTile label="Grupowanie" value={groupingEnabled ? 'Włączone' : 'Brak'} />
            <MetricTile label="Wyniki" value={hasResults ? 'Włączone' : 'Wyłączone'} />
            {hasResults && (
              <MetricTile label="Schemat liczenia" value={competitionName ?? 'Proste wyniki'} />
            )}
            <MetricTile
              label="Wyniki na żywo"
              value={getLiveVisibilityLabel(hasResults, resultsPublic)}
            />
          </div>
        </div>
      </div>

      <aside data-tutorial-id="event-publish" className="h-fit rounded-3xl bg-white p-6 shadow-sm xl:sticky xl:top-8">
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
  invalid,
  errorMessageId,
}: {
  Icon: LucideIcon
  title: string
  children: React.ReactNode
  tutorialId?: string
  invalid?: boolean
  errorMessageId?: string
}) {
  return (
    <section
      id={tutorialId}
      data-tutorial-id={tutorialId}
      tabIndex={invalid ? -1 : undefined}
      aria-describedby={invalid ? errorMessageId : undefined}
      className="rounded-3xl bg-white p-5 shadow-sm outline-none focus:ring-2 focus:ring-red-400 sm:p-7"
    >
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
    <div className={cn('rounded-3xl border bg-white p-5 shadow-sm', accent ? 'border-accent' : 'border-transparent')}>
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
