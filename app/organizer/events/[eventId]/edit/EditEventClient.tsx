'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Activity,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  GalleryHorizontal,
  ImagePlus,
  MapPin,
  PawPrint,
  Rocket,
  Save,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import FormTemplatePicker from '@/components/FormTemplatePicker'
import EventResultsSetup from '@/components/EventResultsSetup'
import ImageCropUploader from '@/components/ImageCropUploader'
import DateTimePicker from '@/components/DateTimePicker'
import GalleryUploader from '@/components/GalleryUploader'
import { EVENT_TYPES } from '@/lib/eventTypes'
import { validateCompetitionFieldValues } from '@/lib/competitionEngine'
import { validateFormFieldDefinitions } from '@/lib/registrationFormValidation'
import {
  ensureEventTypeRegistrationDependencies,
  validateEventCompetitionDependencies,
} from '@/lib/eventCompetitionDependencies'
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
  { label: 'Podgląd i zapis', shortLabel: 'Podgląd', Icon: Eye },
]

type SaveMode = 'draft' | 'save'

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
    has_schedule: boolean
    auto_confirm: boolean
    max_participants: number | null
    entry_fee: number | null
    image_url: string | null
    organizer_name: string | null
    lat: number | null
    lng: number | null
    gallery_images: string[]
    grouping_field: string | null
    form_template_id: string | null
    competition_format_id: string | null
    competition_config: CompetitionFormatDefinition | null
    competition_values: Record<string, CompetitionScalar>
    competition_config_locked_at: string | null
  }
}

function eventTypeVisual(id: string | null | undefined): { label: string; Icon: LucideIcon } {
  if (id === 'speedway') return { label: 'Szybkość', Icon: Zap }
  if (id === 'agility') return { label: 'Agility', Icon: PawPrint }
  if (id === 'flyball') return { label: 'Drużynowe', Icon: Users }
  if (id === 'fullfocus' || id === 'obedience' || id === 'rally_o') return { label: 'Skupienie', Icon: Activity }
  return { label: EVENT_TYPES.find(type => type.id === id)?.name ?? 'Typ wydarzenia', Icon: PawPrint }
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
  const diff = new Date(endAt).getTime() - new Date(startAt).getTime()
  if (diff <= 0) return 'Sprawdź daty'
  const hours = Math.max(1, Math.round(diff / 36e5))
  if (hours < 24) return `${hours} godz.`
  const days = Math.ceil(hours / 24)
  return `${days} ${days === 1 ? 'dzień' : 'dni'}`
}

export default function EditEventClient({ eventId, initialData }: Props) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [eventTypeId, setEventTypeId] = useState<string>(initialData.event_type_id ?? '')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialData.form_template_id ?? null)
  const [formFields, setFormFields] = useState<FormField[]>(() =>
    ensureEventTypeRegistrationDependencies(
      initialData.event_type_id ?? null,
      initialData.form_fields ?? [],
    )
  )
  const [hasResults, setHasResults] = useState(initialData.has_results ?? false)
  const [resultsPublic, setResultsPublic] = useState(initialData.results_public ?? true)
  const [competitionFormatId, setCompetitionFormatId] = useState<string | null>(
    initialData.competition_format_id ?? null,
  )
  const [competitionDefinition, setCompetitionDefinition] = useState<CompetitionFormatDefinition | null>(
    initialData.competition_config ?? null,
  )
  const [competitionValues, setCompetitionValues] = useState<Record<string, CompetitionScalar>>(
    initialData.competition_values ?? {},
  )
  const [hasSchedule, setHasSchedule] = useState(initialData.has_schedule ?? false)
  const [autoConfirm, setAutoConfirm] = useState(initialData.auto_confirm ?? false)
  const [maxParticipants, setMaxParticipants] = useState<string>(
    initialData.max_participants != null ? String(initialData.max_participants) : '',
  )
  const [entryFeeEnabled, setEntryFeeEnabled] = useState(initialData.entry_fee != null)
  const [entryFee, setEntryFee] = useState<string>(
    initialData.entry_fee != null ? String(initialData.entry_fee) : '',
  )
  const [imageUrl, setImageUrl] = useState<string | null>(initialData.image_url ?? null)
  const [galleryImages, setGalleryImages] = useState<string[]>(initialData.gallery_images ?? [])
  const [organizerName, setOrganizerName] = useState(initialData.organizer_name ?? '')
  const [title, setTitle] = useState(initialData.title ?? '')
  const [description, setDescription] = useState(initialData.description ?? '')
  const [startAt, setStartAt] = useState<string | null>(initialData.start_at ?? null)
  const [endAt, setEndAt] = useState<string | null>(initialData.end_at ?? null)
  const [registrationDeadline, setRegistrationDeadline] = useState<string | null>(initialData.registration_deadline ?? null)
  const [lat, setLat] = useState<number | null>(initialData.lat ?? null)
  const [lng, setLng] = useState<number | null>(initialData.lng ?? null)
  const [location, setLocation] = useState(initialData.location ?? '')
  const [groupingField, setGroupingField] = useState(initialData.grouping_field ?? '')

  const selectedType = EVENT_TYPES.find(type => type.id === eventTypeId)
  const selectedVisual = eventTypeVisual(eventTypeId)
  const groupableFields = useMemo(
    () => formFields.filter(field => ['select', 'multiselect', 'multidate'].includes(field.type)),
    [formFields],
  )
  const seatsLabel = maxParticipants ? `${maxParticipants} miejsc` : 'Bez limitu miejsc'
  const feeLabel = entryFeeEnabled ? formatMoney(entryFee) : 'Bezpłatne'

  function handleEventTypeChange(id: string) {
    setEventTypeId(id)
    setFormFields(current => ensureEventTypeRegistrationDependencies(id, current))
  }

  function handleTemplateSelect(templateId: string | null, fields: FormField[]) {
    const compatibleFields = ensureEventTypeRegistrationDependencies(eventTypeId, fields)
    setSelectedTemplateId(templateId)
    setFormFields(compatibleFields)
    if (!compatibleFields.some(field => field.id === groupingField)) setGroupingField('')
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

  function handleMapLocation(nextLat: number, nextLng: number, address: string) {
    setLat(nextLat)
    setLng(nextLng)
    setLocation(address)
  }

  function validateStep(step: number, nextStatus = initialData.status ?? 'upcoming') {
    setError(null)
    const publishing = nextStatus !== 'draft'

    if (step === 0) {
      if (publishing && !title.trim()) {
        setError('Podaj nazwę wydarzenia.')
        return false
      }
      if (publishing && !eventTypeId) {
        setError('Wybierz typ wydarzenia przed publikacją.')
        return false
      }
    }

    if (step === 1 && publishing) {
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
      if (publishing) {
        const formIssues = validateFormFieldDefinitions(formFields)
        if (formIssues.length > 0) {
          setError(formIssues[0].message)
          return false
        }
      }
    }

    if (step === 3 && publishing && hasResults && competitionDefinition) {
      const dependencyIssues = validateEventCompetitionDependencies(
        formFields,
        competitionDefinition,
      )
      if (dependencyIssues.length > 0) {
        setError(`${dependencyIssues[0].message} Wróć do kroku rejestracji, aby poprawić formularz.`)
        return false
      }
      const valueIssues = validateCompetitionFieldValues(
        competitionDefinition.eventFields,
        competitionValues,
      )
      if (valueIssues.length > 0) {
        setError(valueIssues[0].message)
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

  async function saveEvent(nextStatus: 'draft' | 'upcoming', mode: SaveMode) {
    for (let step = 0; step < STEPS.length - 1; step += 1) {
      if (!validateStep(step, nextStatus)) {
        setCurrentStep(step)
        return
      }
    }

    setLoading(true)
    setSavingMode(mode)
    setError(null)

    const payload = {
      title: title.trim() || 'Szkic wydarzenia',
      description: description.trim() || null,
      location: location.trim() || null,
      start_at: startAt,
      end_at: endAt || null,
      registration_deadline: registrationDeadline || null,
      status: nextStatus,
      event_type_id: eventTypeId || null,
      form_fields: formFields,
      form_template_id: selectedTemplateId,
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
      ...(initialData.competition_config_locked_at ? {} : {
        competition_format_id: competitionFormatId,
        competition_config: competitionFormatId ? undefined : competitionDefinition,
        competition_values: competitionValues,
      }),
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
      setSavingMode(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Edycja wydarzenia</p>
          <h1 className="mt-2 text-4xl font-heading font-bold text-primary">Kreator Wydarzenia</h1>
          <p className="mt-2 text-muted-foreground">Krok {currentStep + 1}: {STEPS[currentStep].label}</p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-sage-200 bg-white px-4 py-2 text-sm text-sage-600 shadow-sm">
          <Check className="h-4 w-4 text-accent" />
          Edytujesz istniejące wydarzenie
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-sage-200 bg-white shadow-sm">
        <WizardStepper currentStep={currentStep} onStepChange={goToStep} />

        <div className="p-5 sm:p-8 lg:p-10">
          {currentStep === 0 && (
            <div className="space-y-8">
              <SectionHeader
                Icon={ImagePlus}
                eyebrow="Podstawy"
                title="Miniaturka i opis wydarzenia"
                description="Zaktualizuj nazwę, organizatora, opis, typ wydarzenia oraz zdjęcia."
              />

              <details className="group rounded-3xl border border-sage-200 bg-sage-50/50">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold text-primary marker:hidden">
                  Zdjęcie główne (opcjonalnie)
                  <ChevronRight className="h-5 w-5 transition-transform group-open:rotate-90" />
                </summary>
                <div className="mx-auto max-w-2xl border-t border-sage-200 p-4">
                  <div className="rounded-3xl border-2 border-dashed border-sage-200 bg-white p-3">
                    <ImageCropUploader currentUrl={imageUrl} onUrlChange={setImageUrl} />
                  </div>
                </div>
              </details>

              <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="space-y-5">
                  <div>
                    <label className="form-label uppercase tracking-[0.16em] text-sage-500">Nazwa wydarzenia *</label>
                    <input className="form-input min-h-14 bg-sage-50 text-base font-semibold" value={title} onChange={e => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label uppercase tracking-[0.16em] text-sage-500">Organizator</label>
                    <input className="form-input min-h-12 bg-sage-50" value={organizerName} onChange={e => setOrganizerName(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label uppercase tracking-[0.16em] text-sage-500">Szczegółowy opis</label>
                    <textarea className="form-input min-h-44 bg-sage-50 text-base leading-7" value={description} onChange={e => setDescription(e.target.value)} />
                  </div>

                  <details className="group rounded-3xl border border-sage-200 bg-white shadow-sm">
                    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between p-5 marker:hidden">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-accent">
                        <GalleryHorizontal className="h-5 w-5" />
                      </span>
                      <div>
                        <h2 className="section-title mb-0">Galeria zdjęć</h2>
                        <p className="text-sm text-muted-foreground">Dodatkowe zdjęcia wydarzenia dla strony publicznej.</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="border-t border-sage-200 p-5">
                      <GalleryUploader images={galleryImages} onImagesChange={setGalleryImages} />
                    </div>
                  </details>
                </div>

                <EventTypePicker
                  eventTypeId={eventTypeId}
                  onEventTypeChange={handleEventTypeChange}
                  selectedTypeName={selectedType?.name}
                />
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
              <Panel Icon={MapPin} title="Lokalizacja">
                <MapPicker lat={lat} lng={lng} location={location} onLocationChange={handleMapLocation} />
              </Panel>

              <Panel Icon={CalendarDays} title="Harmonogram">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="form-label">Data rozpoczęcia</label>
                    <DateTimePicker value={startAt} onChange={setStartAt} placeholder="Wybierz datę startu" />
                  </div>
                  <div>
                    <label className="form-label">Data zakończenia</label>
                    <DateTimePicker value={endAt} onChange={setEndAt} placeholder="Opcjonalnie" />
                  </div>
                </div>
                <div className="mt-8 rounded-3xl border border-sage-200 bg-sage-50 p-5">
                  <p className="text-sm font-semibold text-primary">Podgląd czasu trwania</p>
                  <p className="mt-1 text-3xl font-heading font-bold text-accent">{durationLabel(startAt, endAt)}</p>
                </div>
              </Panel>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-8">
              <Panel Icon={FileText} title="Formularz zapisów">
                <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                  Dane właściciela i psa są zawsze dostępne. Tutaj ustawiasz tylko dodatkowe pytania organizatora.
                </p>
                {eventTypeId === 'speedway' && (
                  <div className="mb-5 flex gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-relaxed text-green-900">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>
                      Formularz zawiera wymagane źródło klasy Speedway: wzrost psa albo pełny wybór XS–XL.
                    </p>
                  </div>
                )}
                <FormTemplatePicker eventTypeId={eventTypeId || null} selectedTemplateId={selectedTemplateId} initialConfiguredFields={initialData.form_fields ?? []} onSelect={handleTemplateSelect} />
                {groupableFields.length > 0 && (
                  <details className="group mt-5 rounded-2xl border border-sage-200 bg-sage-50/60">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-primary marker:hidden">
                      Grupowanie listy zapisów (opcjonalnie)
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="border-t border-sage-200 p-4">
                      <select className="form-input min-h-11" value={groupingField} onChange={e => setGroupingField(e.target.value)}>
                        <option value="">Brak grupowania</option>
                        {groupableFields.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
                      </select>
                    </div>
                  </details>
                )}
              </Panel>

              <div className="grid items-start gap-6 lg:grid-cols-2">
                <Panel Icon={Users} title="Limity uczestników">
                  <label className="form-label uppercase tracking-[0.16em] text-sage-500">Całkowita liczba miejsc</label>
                  <div className="relative">
                    <input className="form-input min-h-14 pr-16 text-lg" type="number" min="1" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-sage-500">psów</span>
                  </div>
                </Panel>

                <Panel Icon={CalendarDays} title="Terminy zapisów">
                  <label className="form-label uppercase tracking-[0.16em] text-sage-500">Zamknięcie zapisów</label>
                  <DateTimePicker value={registrationDeadline} onChange={setRegistrationDeadline} placeholder="Opcjonalnie" />
                </Panel>

                <Panel Icon={Wallet} title="Opłaty">
                  <ToggleRow checked={entryFeeEnabled} onChange={checked => { setEntryFeeEnabled(checked); if (!checked) setEntryFee('') }} title="Pobieraj wpisowe" description="Zachowuje istniejącą logikę wpisowego w PLN." />
                  {entryFeeEnabled && (
                    <div className="mt-5">
                      <label className="form-label uppercase tracking-[0.16em] text-sage-500">Wpisowe (PLN) *</label>
                      <input className="form-input min-h-14 text-lg" type="number" min="0" step="0.01" value={entryFee} onChange={e => setEntryFee(e.target.value)} />
                    </div>
                  )}
                </Panel>

                <Panel Icon={ShieldCheck} title="Automatyzacja">
                  <div className="space-y-3">
                    <ToggleRow checked={autoConfirm} onChange={setAutoConfirm} title="Auto-potwierdzanie zapisów" description="System automatycznie zaakceptuje nowe zgłoszenia." />
                    <ToggleRow checked={hasSchedule} onChange={setHasSchedule} title="Włącz grafik startów" description="Organizator będzie mógł przypisywać uczestnikom terminy startów." />
                  </div>
                </Panel>
              </div>

            </div>
          )}

          {currentStep === 3 && (
            initialData.competition_config_locked_at ? (
              <div className="space-y-5">
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
                  <h2 className="font-heading text-xl font-bold">Schemat wyników jest zablokowany</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed">
                    Po zapisaniu pierwszego wyniku nie można już zmieniać sposobu liczenia. Chroni to istniejące dane i klasyfikację. Widoczność wyników możesz nadal zmienić poniżej.
                  </p>
                </div>
                <Panel Icon={Eye} title="Widoczność wyników">
                  <ToggleRow
                    checked={resultsPublic}
                    onChange={setResultsPublic}
                    title="Wyniki i live publiczne"
                    description="Wyłącz, jeśli chcesz tymczasowo ukryć wyniki przed uczestnikami."
                  />
                </Panel>
              </div>
            ) : (
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
            )
          )}

          {currentStep === 4 && (
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="space-y-6">
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
                        <selectedVisual.Icon className="h-4 w-4" />
                        {selectedVisual.label}
                      </span>
                      <span className="inline-flex rounded-full bg-white/15 px-4 py-2 text-sm backdrop-blur">Limit: {seatsLabel}</span>
                    </div>
                    <h2 className="max-w-3xl text-4xl font-heading font-bold leading-tight sm:text-6xl">{title || 'Nazwa wydarzenia'}</h2>
                    {description && <p className="mt-4 max-w-3xl text-lg leading-8 text-white/90">{description}</p>}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <SummaryTile Icon={CalendarDays} label="Data i czas" value={formatDateTime(startAt)} detail={endAt ? `Do: ${formatDateTime(endAt)}` : 'Bez osobnej daty zakończenia'} accent />
                  <SummaryTile Icon={MapPin} label="Lokalizacja" value={location || 'Lokalizacja do uzupełnienia'} detail={organizerName ? `Organizator: ${organizerName}` : 'Organizator nieuzupełniony'} />
                  <SummaryTile Icon={Wallet} label="Koszt uczestnictwa" value={feeLabel} detail={autoConfirm ? 'Zapisy auto-potwierdzane' : 'Zapisy wymagają akceptacji'} />
                  <SummaryTile Icon={Clock} label="Zapisy do" value={registrationDeadline ? formatDateTime(registrationDeadline) : 'Bez terminu'} detail="Po terminie zapisy zostaną zamknięte" />
                </div>

                <div className="rounded-3xl border border-sage-200 bg-white p-6 shadow-sm">
                  <h2 className="section-title">Sprawdzenie konfiguracji</h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricTile label="Pytania dodatkowe" value={String(formFields.length)} />
                    <MetricTile label="Grafik startów" value={hasSchedule ? 'Włączony' : 'Wyłączony'} />
                    <MetricTile label="Wyniki" value={hasResults ? 'Włączone' : 'Wyłączone'} />
                    <MetricTile
                      label="Schemat liczenia"
                      value={hasResults ? competitionDefinition?.name ?? 'Proste wyniki' : 'Nie dotyczy'}
                    />
                  </div>
                </div>
              </div>

              <aside className="h-fit rounded-3xl border border-sage-200 bg-white p-6 shadow-sm xl:sticky xl:top-8">
                <div className="mb-6 flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
                    <Save className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="section-title mb-0">Zapis zmian</h2>
                    <p className="text-sm text-muted-foreground">Sprawdź podgląd i wybierz akcję na dole.</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Informacja</p>
                  <p className="mt-3 text-sm leading-6 text-sage-700">
                    Zapis w szkicu ukrywa wydarzenie przed publicznymi stronami. Publikacja zapisuje zmiany i udostępnia wydarzenie jako nadchodzące.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-8 lg:mx-10">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 border-t border-sage-200 bg-white/90 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <button type="button" onClick={goBack} className="btn btn-secondary min-h-12 px-6">
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
              <button type="button" onClick={() => saveEvent('draft', 'draft')} disabled={loading} className="btn btn-secondary min-h-12 px-8">
                {loading && savingMode === 'draft' ? 'Zapisywanie...' : 'Zapisz zmiany w szkicu'}
              </button>
              <button type="button" onClick={() => saveEvent('upcoming', 'save')} disabled={loading} className="btn btn-primary min-h-12 px-8 shadow-primary/10">
                {loading && savingMode === 'save' ? 'Publikowanie...' : 'Opublikuj'}
                <Rocket className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WizardStepper({ currentStep, onStepChange }: { currentStep: number; onStepChange: (step: number) => void }) {
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
              className="group flex min-w-0 flex-col items-center gap-1 rounded-2xl p-1 text-center transition-colors hover:bg-sage-50 sm:flex-row sm:gap-2 sm:p-2 sm:text-left"
              title={label}
              aria-label={`Krok ${index + 1}: ${label}`}
            >
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors sm:h-10 sm:w-10', active && 'border-accent bg-white text-accent ring-4 ring-orange-100', complete && 'border-primary bg-primary text-white', !active && !complete && 'border-sage-200 bg-white text-sage-400')}>
                {complete ? <Check className="h-4 w-4" /> : active ? index + 1 : <Icon className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span className={cn('hidden text-[10px] font-bold uppercase tracking-[0.12em] sm:block', active ? 'text-accent' : complete ? 'text-primary' : 'text-sage-400')}>Krok {index + 1}</span>
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

function EventTypePicker({ eventTypeId, onEventTypeChange, selectedTypeName }: { eventTypeId: string; onEventTypeChange: (id: string) => void; selectedTypeName?: string }) {
  const activeVisual = eventTypeId ? eventTypeVisual(eventTypeId) : null
  return (
    <div className="space-y-4">
      <div>
        <p className="form-label uppercase tracking-[0.16em] text-sage-500">Kategorie specjalne</p>
        <p className="text-sm text-muted-foreground">Wybrany typ: {selectedTypeName ?? 'brak'}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
        {EVENT_TYPES.map(type => {
          const visual = eventTypeVisual(type.id)
          const selected = eventTypeId === type.id
          return (
            <button key={type.id} type="button" onClick={() => onEventTypeChange(type.id)} className={cn('group flex min-h-14 items-center gap-2.5 rounded-xl border bg-white p-2.5 text-left shadow-sm transition-all hover:border-accent hover:shadow-md', selected ? 'border-accent ring-2 ring-orange-100' : 'border-sage-200')}>
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors', selected ? 'bg-accent text-white' : 'bg-sage-100 text-sage-500 group-hover:bg-orange-50 group-hover:text-accent')}>
                <visual.Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 truncate text-sm font-semibold text-primary">{visual.label}</span>
            </button>
          )
        })}
      </div>
      {activeVisual && (
        <p className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-700">
          Wybrano: <strong>{activeVisual.label}</strong>
        </p>
      )}
    </div>
  )
}

function SectionHeader({ Icon, eyebrow, title, description }: { Icon: LucideIcon; eyebrow: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-4">
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

function Panel({ Icon, title, children }: { Icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-sage-200 bg-white p-5 shadow-sm sm:p-7">
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

function ToggleRow({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-colors', checked ? 'border-accent bg-orange-50/70' : 'border-sage-200 bg-sage-50 hover:border-sage-300')}>
      <span>
        <span className="block font-semibold text-primary">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
      <span className={cn('relative h-8 w-14 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-sage-300')}>
        <span className={cn('absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-7' : 'translate-x-1')} />
      </span>
    </button>
  )
}

function SummaryTile({ Icon, label, value, detail, accent }: { Icon: LucideIcon; label: string; value: string; detail: string; accent?: boolean }) {
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

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-sage-200 bg-sage-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-sage-500">{label}</p>
      <p className="mt-1 break-words font-semibold text-primary">{value}</p>
    </div>
  )
}
