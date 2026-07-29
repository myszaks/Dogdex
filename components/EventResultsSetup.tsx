'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Calculator,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Library,
  Pencil,
  Save,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react'
import CompetitionFormatPicker from '@/components/CompetitionFormatPicker'
import CompetitionFormatStudio from '@/components/CompetitionFormatStudio'
import SpeedwayClassEditor from '@/components/SpeedwayClassEditor'
import {
  COMPETITION_PRESETS,
  cloneCompetitionPreset,
  getRecommendedCompetitionPreset,
  isLikelyNonCompetitiveEvent,
} from '@/lib/eventCompetitionSetup'
import { cn } from '@/lib/utils'
import type {
  CompetitionFieldDefinition,
  CompetitionFormatDefinition,
  CompetitionScalar,
} from '@/types/competition'

interface Props {
  eventTypeId: string | null
  enabled: boolean
  resultsPublic: boolean
  formatId: string | null
  definition: CompetitionFormatDefinition | null
  values: Record<string, CompetitionScalar>
  onEnabledChange: (enabled: boolean) => void
  onResultsPublicChange: (isPublic: boolean) => void
  onFormatSelect: (
    id: string | null,
    definition: CompetitionFormatDefinition | null,
  ) => void
  onValuesChange: (values: Record<string, CompetitionScalar>) => void
}

export default function EventResultsSetup({
  eventTypeId,
  enabled,
  resultsPublic,
  formatId,
  definition,
  values,
  onEnabledChange,
  onResultsPublicChange,
  onFormatSelect,
  onValuesChange,
}: Props) {
  const recommended = getRecommendedCompetitionPreset(eventTypeId)
  const nonCompetitive = isLikelyNonCompetitiveEvent(eventTypeId)
  const [showSavedFormats, setShowSavedFormats] = useState(false)
  const [studioOpen, setStudioOpen] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studioOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [studioOpen])

  const activePresetKey = useMemo(() => {
    if (formatId || !definition) return null
    return COMPETITION_PRESETS.find(preset =>
      JSON.stringify(preset.definition) === JSON.stringify(definition)
    )?.key ?? null
  }, [definition, formatId])

  function toggleResults(nextEnabled: boolean) {
    onEnabledChange(nextEnabled)
    setError(null)
    setMessage(null)
    if (nextEnabled && !definition && recommended) {
      onFormatSelect(null, cloneCompetitionPreset(recommended.key))
    }
  }

  function chooseBasicResults() {
    onFormatSelect(null, null)
    onValuesChange({})
    setMessage(null)
  }

  function choosePreset(key: (typeof COMPETITION_PRESETS)[number]['key']) {
    onFormatSelect(null, cloneCompetitionPreset(key))
    onValuesChange({})
    setMessage(null)
  }

  async function saveAsOwnTemplate() {
    if (!definition) return
    setSavingTemplate(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/competition-formats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: definition.name,
          description: 'Schemat utworzony podczas tworzenia wydarzenia.',
          definition,
          status: 'published',
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? 'Nie udało się zapisać schematu.')
      onFormatSelect(json.id, json.definition ?? definition)
      setMessage('Schemat zapisano na Twoim koncie i zastosowano do wydarzenia.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nie udało się zapisać schematu.')
    } finally {
      setSavingTemplate(false)
    }
  }

  return (
    <div className="space-y-6">
      <section data-tutorial-id="results-toggle" className="overflow-hidden rounded-3xl border border-sage-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex gap-4">
            <span className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
              enabled ? 'bg-orange-100 text-accent' : 'bg-sage-100 text-sage-500',
            )}>
              <Trophy className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-heading font-bold text-primary">
                Czy wydarzenie potrzebuje wyników lub transmisji live?
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Włącz tę część tylko dla zawodów, konkursów lub wydarzeń z ocenami.
                Spacer, warsztaty i szkolenia mogą ją po prostu pominąć.
              </p>
            </div>
          </div>
          <label className="inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-3 rounded-2xl border border-sage-200 bg-sage-50 px-4">
            <input
              type="checkbox"
              checked={enabled}
              onChange={event => toggleResults(event.target.checked)}
              className="h-5 w-5 rounded border-sage-300 text-accent"
            />
            <span className="font-semibold text-primary">
              {enabled ? 'Włączone' : 'Wyłączone'}
            </span>
          </label>
        </div>

        {!enabled && (
          <div className={cn(
            'border-t px-6 py-4 text-sm sm:px-8',
            nonCompetitive
              ? 'border-sage-200 bg-sage-50 text-sage-700'
              : recommended
                ? 'border-orange-200 bg-orange-50 text-orange-900'
                : 'border-sage-200 bg-sage-50 text-sage-700',
          )}>
            {nonCompetitive
              ? 'Dobra decyzja dla tego typu wydarzenia — rejestracja i publikacja zadziałają bez modułu wyników.'
              : recommended
                ? `Dla tego typu wydarzenia mamy gotową propozycję „${recommended.label}”. Zostanie zastosowana dopiero po włączeniu modułu.`
                : 'Możesz przejść dalej. Moduł wyników da się też włączyć później przy edycji wydarzenia.'}
          </div>
        )}
      </section>

      {enabled && (
        <>
          {recommended && (
            <div className="flex gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <p>
                <strong>Podpowiedź:</strong> dla wybranego typu wydarzenia najczęściej sprawdza się
                schemat „{recommended.label}”. Możesz go dowolnie dostosować.
              </p>
            </div>
          )}

          <section data-tutorial-id="results-method" className="rounded-3xl border border-sage-200 bg-white p-6 shadow-sm sm:p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Sposób liczenia</p>
              <h2 className="mt-1 text-xl font-heading font-bold text-primary">Jak liczymy wyniki?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Wybierz najbliższy wariant. Nie musisz znać technicznych zasad systemu.
              </p>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {eventTypeId !== 'speedway' && (
                <ChoiceCard
                  selected={!formatId && !definition}
                  title="Proste wyniki"
                  description="Ręczne wpisywanie miejsca, czasu i punktów — bez automatycznych obliczeń."
                  onClick={chooseBasicResults}
                />
              )}
              {COMPETITION_PRESETS.map(preset => (
                <ChoiceCard
                  key={preset.key}
                  selected={!formatId && activePresetKey === preset.key}
                  title={preset.label}
                  description={preset.description}
                  recommended={recommended?.key === preset.key}
                  onClick={() => choosePreset(preset.key)}
                />
              ))}
            </div>

            {eventTypeId === 'speedway' && (
              <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                Speedway korzysta ze schematu obliczeniowego, aby długość toru, klasy wzrostowe, czasy i prędkość miały jedno spójne źródło danych.
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowSavedFormats(current => !current)}
              className="mt-5 flex w-full items-center justify-between rounded-2xl border border-sage-200 bg-sage-50 px-4 py-3 text-left text-sm font-semibold text-primary transition hover:border-sage-300"
              aria-expanded={showSavedFormats}
            >
              <span className="flex items-center gap-2">
                <Library className="h-4 w-4 text-accent" />
                Wybierz jeden z moich zapisanych schematów
              </span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', showSavedFormats && 'rotate-180')} />
            </button>

            {showSavedFormats && (
              <div className="mt-4 rounded-2xl border border-sage-200 p-4">
                <CompetitionFormatPicker
                  selectedId={formatId}
                  values={values}
                  onSelect={onFormatSelect}
                  onValuesChange={onValuesChange}
                  showEventFields={false}
                />
              </div>
            )}
          </section>

          {definition && (
            <section className="rounded-3xl border border-sage-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Ustawienia wybranego schematu</p>
                  <h2 className="mt-1 text-xl font-heading font-bold text-primary">{definition.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {definition.resultFields.length} pól wyniku · {definition.computedFields.length} obliczeń · {definition.views.length} widoki
                  </p>
                </div>
              </div>

              <EventParameterFields
                fields={definition.eventFields}
                values={values}
                onChange={onValuesChange}
              />

              {eventTypeId === 'speedway' && (
                <SpeedwayClassEditor
                  definition={definition}
                  onChange={nextDefinition => {
                    onFormatSelect(null, nextDefinition)
                    setMessage('Klasy wzrostowe dostosowano dla tego wydarzenia.')
                  }}
                />
              )}

              <details className="group mt-5 rounded-2xl border border-sage-200 bg-sage-50/60">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-primary marker:hidden">
                  <span className="flex items-center gap-2">
                    <Pencil className="h-4 w-4 text-accent" />
                    Ustawienia zaawansowane
                  </span>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="flex flex-wrap gap-3 border-t border-sage-200 p-4">
                  <button type="button" onClick={() => setStudioOpen(true)} className="btn btn-secondary min-h-11">
                    <Pencil className="h-4 w-4" />
                    Zmień zasady i widoki
                  </button>
                  {!formatId && (
                    <button
                      type="button"
                      onClick={saveAsOwnTemplate}
                      disabled={savingTemplate}
                      className="btn btn-secondary min-h-11"
                    >
                      <Save className="h-4 w-4" />
                      {savingTemplate ? 'Zapisywanie…' : 'Zapisz jako mój schemat'}
                    </button>
                  )}
                  <p className="w-full text-xs leading-relaxed text-muted-foreground">
                    Te opcje są potrzebne tylko wtedy, gdy gotowy schemat nie odzwierciedla zasad Twoich zawodów.
                  </p>
                </div>
              </details>

              {message && (
                <p className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</p>
              )}
              {error && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
              )}
            </section>
          )}

          <section data-tutorial-id="results-visibility" className="rounded-3xl border border-sage-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Widoczność</p>
            <h2 className="mt-1 text-xl font-heading font-bold text-primary">Co widzą uczestnicy?</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <VisibilityCard
                selected={resultsPublic}
                Icon={Eye}
                title="Wyniki i live publiczne"
                description="Uczestnicy mogą śledzić przebieg i bieżącą klasyfikację."
                onClick={() => onResultsPublicChange(true)}
              />
              <VisibilityCard
                selected={!resultsPublic}
                Icon={EyeOff}
                title="Na razie prywatne"
                description="Organizator wpisuje wyniki, ale publikuje je dopiero w wybranym momencie."
                onClick={() => onResultsPublicChange(false)}
              />
            </div>
          </section>
        </>
      )}

      {studioOpen && definition && (
        <div
          className="fixed inset-0 z-[120] flex items-stretch justify-center overflow-hidden bg-black/50 p-0 backdrop-blur-sm sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Edytor zasad i widoków wyników"
        >
          <div className="flex h-full w-full max-w-7xl flex-col overflow-hidden bg-background shadow-2xl sm:h-[calc(100dvh-2rem)] sm:rounded-3xl sm:border sm:border-sage-200">
            <div className="flex shrink-0 items-center justify-between border-b border-sage-200 px-5 py-3">
              <p className="font-semibold text-primary">Zasady i widoki wyników</p>
              <button
                type="button"
                onClick={() => setStudioOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-100 text-sage-600 hover:bg-sage-200"
                aria-label="Zamknij edytor zasad"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <CompetitionFormatStudio
                embedded
                initialName={definition.name}
                initialDefinition={definition}
                onCancel={() => setStudioOpen(false)}
                onApply={nextDefinition => {
                  onFormatSelect(null, nextDefinition)
                  setStudioOpen(false)
                  setMessage('Dostosowane zasady zastosowano do tego wydarzenia.')
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChoiceCard({
  selected,
  title,
  description,
  recommended = false,
  onClick,
}: {
  selected: boolean
  title: string
  description: string
  recommended?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative min-h-36 rounded-2xl border p-4 text-left transition',
        selected
          ? 'border-accent bg-orange-50 ring-2 ring-orange-100'
          : 'border-sage-200 bg-white hover:border-sage-300 hover:bg-sage-50',
      )}
    >
      {recommended && (
        <span className="absolute right-3 top-3 rounded-full bg-accent px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
          Polecany
        </span>
      )}
      <Calculator className={cn('h-5 w-5', selected ? 'text-accent' : 'text-sage-500')} />
      <span className="mt-3 block pr-16 font-bold text-primary">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      {selected && <Check className="absolute bottom-3 right-3 h-5 w-5 text-accent" />}
    </button>
  )
}

function EventParameterFields({
  fields,
  values,
  onChange,
}: {
  fields: CompetitionFieldDefinition[]
  values: Record<string, CompetitionScalar>
  onChange: (values: Record<string, CompetitionScalar>) => void
}) {
  if (fields.length === 0) return null

  function updateValue(fieldId: string, value: CompetitionScalar) {
    onChange({ ...values, [fieldId]: value })
  }

  return (
    <div className="mt-6 rounded-2xl border border-sage-200 bg-sage-50 p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-sage-500">
        Uzupełnij dla tego wydarzenia
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(field => (
          <label key={field.id} className="block">
            <span className="form-label">{field.label}{field.required ? ' *' : ''}</span>
            {field.type === 'boolean' ? (
              <input
                type="checkbox"
                checked={values[field.id] === true}
                onChange={event => updateValue(field.id, event.target.checked)}
                className="h-5 w-5 rounded border-sage-300"
              />
            ) : (
              <div className="relative">
                <input
                  type={field.type === 'text' ? 'text' : 'number'}
                  min={field.min}
                  max={field.max}
                  step={field.precision ? 10 ** -field.precision : 'any'}
                  value={values[field.id] === null || values[field.id] === undefined ? '' : String(values[field.id])}
                  onChange={event => updateValue(
                    field.id,
                    field.type === 'text'
                      ? event.target.value
                      : event.target.value === '' ? null : Number(event.target.value),
                  )}
                  className="form-input"
                />
                {field.unit && (
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-sage-500">
                    {field.unit}
                  </span>
                )}
              </div>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}

function VisibilityCard({
  selected,
  Icon,
  title,
  description,
  onClick,
}: {
  selected: boolean
  Icon: typeof Eye
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex gap-4 rounded-2xl border p-4 text-left transition',
        selected ? 'border-accent bg-orange-50' : 'border-sage-200 hover:bg-sage-50',
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', selected ? 'text-accent' : 'text-sage-500')} />
      <span>
        <span className="block font-bold text-primary">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}
