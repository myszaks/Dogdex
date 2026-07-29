'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calculator, Eye, Flag, Layers3, Plus, Save, Trash2 } from 'lucide-react'
import { SPEEDWAY_FORMAT, TIME_TRIAL_FORMAT } from '@/lib/competitionPresets'
import type {
  CompetitionComputedFieldDefinition,
  CompetitionFieldDefinition,
  CompetitionFieldType,
  CompetitionFormatDefinition,
  CompetitionViewBlockType,
} from '@/types/competition'

type StudioStep = 'data' | 'calculations' | 'ranking' | 'views'
type ReducerOperator = 'min' | 'max' | 'sum' | 'average'

interface Props {
  formatId?: string
  initialName?: string
  initialDescription?: string | null
  initialDefinition?: CompetitionFormatDefinition
}

const STEPS: Array<{ id: StudioStep; label: string; Icon: typeof Layers3 }> = [
  { id: 'data', label: 'Dane i próby', Icon: Layers3 },
  { id: 'calculations', label: 'Obliczenia', Icon: Calculator },
  { id: 'ranking', label: 'Ranking', Icon: Flag },
  { id: 'views', label: 'Widoki', Icon: Eye },
]

const FIELD_TYPE_LABELS: Record<CompetitionFieldType, string> = {
  number: 'Liczba',
  duration_ms: 'Czas (ms)',
  text: 'Tekst',
  boolean: 'Tak / nie',
}

const VIEW_BLOCK_LABELS: Record<CompetitionViewBlockType, string> = {
  current_entry: 'Aktualnie startuje',
  next_up: 'Następni zawodnicy',
  result_table: 'Tabela wyników',
  leaderboard: 'Klasyfikacja live',
  podium: 'Podium',
  metric: 'Wyróżniona metryka',
  progress: 'Postęp zawodów',
  message: 'Komunikat organizatora',
}

function cloneDefaultDefinition(): CompetitionFormatDefinition {
  return structuredClone(TIME_TRIAL_FORMAT)
}

function nextIdentifier(existing: string[], prefix: string) {
  let index = existing.length + 1
  while (existing.includes(`${prefix}_${index}`)) index += 1
  return `${prefix}_${index}`
}

function reducerDetails(field: CompetitionComputedFieldDefinition): {
  operator: ReducerOperator
  source: string
} | null {
  const expression = field.expression
  if (
    ['min', 'max', 'sum', 'average'].includes(expression.op)
    && 'args' in expression
    && expression.args[0]?.op === 'ref'
  ) {
    return {
      operator: expression.op as ReducerOperator,
      source: expression.args[0].path.split('.').at(-1) ?? '',
    }
  }
  return null
}

export default function CompetitionFormatStudio({
  formatId,
  initialName,
  initialDescription,
  initialDefinition,
}: Props) {
  const router = useRouter()
  const [step, setStep] = useState<StudioStep>('data')
  const [name, setName] = useState(initialName ?? 'Nowy format zawodów')
  const [description, setDescription] = useState(initialDescription ?? '')
  const [definition, setDefinition] = useState<CompetitionFormatDefinition>(
    initialDefinition ? structuredClone(initialDefinition) : cloneDefaultDefinition()
  )
  const [saving, setSaving] = useState<'draft' | 'published' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const numericResultFields = definition.resultFields.filter(field =>
    field.type === 'number' || field.type === 'duration_ms'
  )
  const computedOptions = useMemo(
    () => definition.computedFields.map(field => ({ id: field.id, label: field.label })),
    [definition.computedFields],
  )

  function updateDefinition(patch: Partial<CompetitionFormatDefinition>) {
    setDefinition(current => ({ ...current, ...patch }))
  }

  function updateFields(
    collection: 'eventFields' | 'resultFields',
    fields: CompetitionFieldDefinition[],
  ) {
    updateDefinition({ [collection]: fields })
  }

  function addField(collection: 'eventFields' | 'resultFields') {
    const prefix = collection === 'eventFields' ? 'param' : 'result'
    updateFields(collection, [
      ...definition[collection],
      {
        id: nextIdentifier(definition[collection].map(field => field.id), prefix),
        label: collection === 'eventFields' ? 'Nowy parametr' : 'Nowy wynik',
        type: 'number',
        required: true,
      },
    ])
  }

  function setAttemptCount(count: number) {
    const safeCount = Math.max(1, Math.min(20, count))
    const firstStage = definition.stages[0] ?? { id: 'main', label: 'Etap główny', attempts: [] }
    updateDefinition({
      stages: [{
        ...firstStage,
        attempts: Array.from({ length: safeCount }, (_, index) =>
          firstStage.attempts[index] ?? {
            id: `attempt_${index + 1}`,
            label: `Próba ${index + 1}`,
          }
        ),
      }],
    })
  }

  function addComputedField() {
    const source = numericResultFields[0]
    if (!source) {
      setError('Najpierw dodaj liczbowe pole wyniku lub czas.')
      setStep('data')
      return
    }
    const metricId = nextIdentifier(
      definition.computedFields.map(field => field.id),
      'metric',
    )
    updateDefinition({
      computedFields: [
        ...definition.computedFields,
        {
          id: metricId,
          label: `Metryka ${definition.computedFields.length + 1}`,
          type: source.type,
          expression: {
            op: 'min',
            args: [{ op: 'ref', path: `valid_attempts.values.${source.id}` }],
          },
        },
      ],
    })
  }

  function updateComputedField(
    index: number,
    patch: Partial<CompetitionComputedFieldDefinition>,
  ) {
    const next = [...definition.computedFields]
    next[index] = { ...next[index], ...patch }
    updateDefinition({ computedFields: next })
  }

  function updateReducer(index: number, operator: ReducerOperator, source: string) {
    const sourceField = definition.resultFields.find(field => field.id === source)
    updateComputedField(index, {
      type: sourceField?.type ?? definition.computedFields[index].type,
      expression: {
        op: operator,
        args: [{ op: 'ref', path: `valid_attempts.values.${source}` }],
      },
    })
  }

  function removeComputedField(index: number) {
    const removedId = definition.computedFields[index].id
    const computedFields = definition.computedFields.filter((_, itemIndex) => itemIndex !== index)
    const fallbackId = computedFields[0]?.id
    const rankings = definition.rankings.map(ranking => ({
      ...ranking,
      eligibility: ranking.eligibility
        && JSON.stringify(ranking.eligibility).includes(`computed.${removedId}`)
        ? undefined
        : ranking.eligibility,
      orderBy: ranking.orderBy
        .filter(order =>
          order.expression.op !== 'ref'
          || order.expression.path !== `computed.${removedId}`
        ),
    })).map(ranking => ranking.orderBy.length > 0 || !fallbackId
      ? ranking
      : {
          ...ranking,
          orderBy: [{
            expression: { op: 'ref' as const, path: `computed.${fallbackId}` },
            direction: 'asc' as const,
            nulls: 'last' as const,
          }],
        }
    )
    const views = definition.views.map(view => ({
      ...view,
      blocks: view.blocks.map(block => ({
        ...block,
        fields: block.fields?.filter(path => path !== `computed.${removedId}`),
      })),
    }))
    updateDefinition({ computedFields, rankings, views })
  }

  function addViewBlock(viewIndex: number, type: CompetitionViewBlockType) {
    const views = structuredClone(definition.views)
    const blockIndex = views[viewIndex].blocks.length + 1
    views[viewIndex].blocks.push({
      id: `${type}_${blockIndex}`,
      type,
      title: VIEW_BLOCK_LABELS[type],
      rankingId: ['leaderboard', 'podium', 'result_table'].includes(type)
        ? definition.rankings[0]?.id
        : undefined,
      fields: ['leaderboard', 'result_table', 'metric'].includes(type)
        ? definition.computedFields.slice(0, 3).map(field => `computed.${field.id}`)
        : undefined,
      limit: type === 'podium' ? 3 : type === 'next_up' ? 5 : undefined,
    })
    updateDefinition({ views })
  }

  function applyStarterPreset(
    preset: CompetitionFormatDefinition,
    presetDescription: string,
  ) {
    setDefinition(structuredClone(preset))
    setName(preset.name)
    setDescription(presetDescription)
    setStep('data')
    setError(null)
  }

  async function save(status: 'draft' | 'published') {
    setSaving(status)
    setError(null)
    const nextDefinition = { ...definition, name: name.trim() }
    try {
      const response = await fetch(
        formatId ? `/api/competition-formats/${formatId}` : '/api/competition-formats',
        {
          method: formatId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            definition: nextDefinition,
            status,
          }),
        },
      )
      const json = await response.json()
      if (!response.ok) {
        const issue = Array.isArray(json.issues) && json.issues[0]
          ? ` ${json.issues[0].path}: ${json.issues[0].message}`
          : ''
        throw new Error(`${json.error ?? 'Nie udało się zapisać formatu.'}${issue}`)
      }
      router.push('/organizer/formats')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać formatu.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/organizer/formats" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Biblioteka formatów
          </Link>
          <h1 className="page-title">{formatId ? 'Edycja formatu' : 'Nowy format zawodów'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reguły zostaną zweryfikowane i wykonywane na backendzie Dogdex.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save('draft')}
            disabled={saving !== null}
            className="btn btn-secondary"
          >
            <Save className="h-4 w-4" />
            {saving === 'draft' ? 'Zapisywanie…' : 'Zapisz szkic'}
          </button>
          <button
            type="button"
            onClick={() => save('published')}
            disabled={saving !== null}
            className="btn btn-primary"
          >
            {saving === 'published' ? 'Publikowanie…' : 'Opublikuj format'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4">
          {!formatId && !initialDefinition && (
            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <p className="form-label">Szablon startowy</p>
              <div className="grid gap-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm justify-start"
                  onClick={() => applyStarterPreset(
                    TIME_TRIAL_FORMAT,
                    'Uniwersalny format dwóch prób czasowych.',
                  )}
                >
                  Próba czasowa
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm justify-start"
                  onClick={() => applyStarterPreset(
                    SPEEDWAY_FORMAT,
                    'Dwie próby, klasy XS–XL, najlepszy czas i prędkość.',
                  )}
                >
                  Speedway
                </button>
              </div>
            </div>
          )}
          <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
            <label className="form-label">Nazwa formatu</label>
            <input className="form-input" value={name} onChange={event => setName(event.target.value)} />
            <label className="form-label mt-4">Opis</label>
            <textarea
              className="form-input min-h-24"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Dla jakich zawodów jest ten format?"
            />
          </div>
          <nav className="rounded-3xl border border-border bg-card p-2 shadow-sm">
            {STEPS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStep(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                  step === item.id ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <item.Icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
          {step === 'data' && (
            <div className="space-y-8">
              <StudioHeading title="Parametry wydarzenia" description="Wartości uzupełniane osobno przy tworzeniu każdego eventu." />
              <FieldCollection
                fields={definition.eventFields}
                onChange={fields => updateFields('eventFields', fields)}
                onAdd={() => addField('eventFields')}
              />

              <StudioHeading title="Pola pojedynczej próby" description="Dane wpisywane przez operatora podczas zawodów." />
              <FieldCollection
                fields={definition.resultFields}
                onChange={fields => updateFields('resultFields', fields)}
                onAdd={() => addField('resultFields')}
              />

              <StudioHeading title="Przebieg zawodów" description="Pierwsza wersja obsługuje jeden etap z wieloma próbami." />
              <div className="grid gap-4 rounded-2xl border border-sage-200 bg-sage-50 p-4 sm:grid-cols-2">
                <label>
                  <span className="form-label">Nazwa etapu</span>
                  <input
                    className="form-input"
                    value={definition.stages[0]?.label ?? ''}
                    onChange={event => {
                      const stage = definition.stages[0]
                      if (stage) updateDefinition({ stages: [{ ...stage, label: event.target.value }] })
                    }}
                  />
                </label>
                <label>
                  <span className="form-label">Liczba prób</span>
                  <input
                    className="form-input"
                    type="number"
                    min={1}
                    max={20}
                    value={definition.stages[0]?.attempts.length ?? 1}
                    onChange={event => setAttemptCount(Number(event.target.value))}
                  />
                </label>
              </div>
            </div>
          )}

          {step === 'calculations' && (
            <div className="space-y-5">
              <StudioHeading
                title="Metryki obliczane"
                description="Agreguj prawidłowe próby. Próby ze statusem DNS, DNF lub DSQ są pomijane."
                action={<button type="button" onClick={addComputedField} className="btn btn-secondary btn-sm"><Plus className="h-4 w-4" />Dodaj</button>}
              />
              {definition.computedFields.map((field, index) => {
                const reducer = reducerDetails(field)
                return (
                  <div key={field.id} className="grid gap-3 rounded-2xl border border-sage-200 p-4 md:grid-cols-[1fr_150px_1fr_auto]">
                    <input
                      className="form-input"
                      value={field.label}
                      onChange={event => updateComputedField(index, {
                        label: event.target.value,
                      })}
                      placeholder="Nazwa metryki"
                    />
                    {reducer ? (
                      <>
                        <select
                          className="form-input"
                          value={reducer.operator}
                          onChange={event => updateReducer(index, event.target.value as ReducerOperator, reducer.source)}
                        >
                          <option value="min">Minimum</option>
                          <option value="max">Maksimum</option>
                          <option value="sum">Suma</option>
                          <option value="average">Średnia</option>
                        </select>
                        <select
                          className="form-input"
                          value={reducer.source}
                          onChange={event => updateReducer(index, reducer.operator, event.target.value)}
                        >
                          {numericResultFields.map(resultField => (
                            <option key={resultField.id} value={resultField.id}>{resultField.label}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <div className="flex items-center rounded-xl bg-violet-50 px-3 text-xs font-semibold text-violet-700 md:col-span-2">
                        Formuła złożona z szablonu
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeComputedField(index)}
                      className="rounded-xl p-3 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      title="Usuń metrykę"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
              {definition.computedFields.length === 0 && (
                <EmptyState text="Dodaj pierwszą metrykę obliczaną." />
              )}
            </div>
          )}

          {step === 'ranking' && (
            <div className="space-y-6">
              <StudioHeading title="Klasyfikacja" description="Wybierz główną metrykę, kierunek sortowania i sposób numerowania remisów." />
              {definition.rankings.map((ranking, index) => {
                const firstOrder = ranking.orderBy[0]
                const selectedMetric = firstOrder?.expression.op === 'ref'
                  ? firstOrder.expression.path.split('.').at(-1) ?? ''
                  : ''
                return (
                  <div key={ranking.id} className="grid gap-4 rounded-2xl border border-sage-200 bg-sage-50 p-5 sm:grid-cols-2">
                    <label>
                      <span className="form-label">Nazwa rankingu</span>
                      <input
                        className="form-input"
                        value={ranking.label}
                        onChange={event => {
                          const rankings = [...definition.rankings]
                          rankings[index] = { ...ranking, label: event.target.value }
                          updateDefinition({ rankings })
                        }}
                      />
                    </label>
                    <label>
                      <span className="form-label">Metryka</span>
                      <select
                        className="form-input"
                        value={selectedMetric}
                        onChange={event => {
                          const rankings = [...definition.rankings]
                          rankings[index] = {
                            ...ranking,
                            orderBy: [{
                              expression: { op: 'ref', path: `computed.${event.target.value}` },
                              direction: firstOrder?.direction ?? 'asc',
                              nulls: 'last',
                            }],
                          }
                          updateDefinition({ rankings })
                        }}
                      >
                        {computedOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className="form-label">Lepszy wynik</span>
                      <select
                        className="form-input"
                        value={firstOrder?.direction ?? 'asc'}
                        onChange={event => {
                          const rankings = [...definition.rankings]
                          rankings[index] = {
                            ...ranking,
                            orderBy: ranking.orderBy.map((order, orderIndex) =>
                              orderIndex === 0
                                ? { ...order, direction: event.target.value as 'asc' | 'desc' }
                                : order
                            ),
                          }
                          updateDefinition({ rankings })
                        }}
                      >
                        <option value="asc">Niższy</option>
                        <option value="desc">Wyższy</option>
                      </select>
                    </label>
                    <label>
                      <span className="form-label">Remisy</span>
                      <select
                        className="form-input"
                        value={ranking.ties}
                        onChange={event => {
                          const rankings = [...definition.rankings]
                          rankings[index] = {
                            ...ranking,
                            ties: event.target.value as typeof ranking.ties,
                          }
                          updateDefinition({ rankings })
                        }}
                      >
                        <option value="competition">1, 2, 2, 4</option>
                        <option value="dense">1, 2, 2, 3</option>
                        <option value="ordinal">1, 2, 3, 4</option>
                      </select>
                    </label>
                  </div>
                )
              })}
            </div>
          )}

          {step === 'views' && (
            <div className="space-y-8">
              <StudioHeading title="Kompozycja widoków" description="Dodawaj bezpieczne, responsywne bloki zamiast dowolnego HTML." />
              {definition.views.map((view, viewIndex) => (
                <section key={view.id} className="space-y-3">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-foreground">{view.label}</h3>
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {view.kind === 'live' ? 'Na żywo' : 'Wyniki końcowe'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {view.blocks.map((block, blockIndex) => (
                      <div key={block.id} className="flex items-center gap-3 rounded-2xl border border-sage-200 p-4">
                        <Eye className="h-4 w-4 shrink-0 text-accent" />
                        <input
                          className="form-input"
                          value={block.title ?? ''}
                          onChange={event => {
                            const views = structuredClone(definition.views)
                            views[viewIndex].blocks[blockIndex].title = event.target.value
                            updateDefinition({ views })
                          }}
                        />
                        <span className="hidden shrink-0 text-xs font-semibold text-muted-foreground sm:block">
                          {VIEW_BLOCK_LABELS[block.type]}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const views = structuredClone(definition.views)
                            views[viewIndex].blocks.splice(blockIndex, 1)
                            updateDefinition({ views })
                          }}
                          className="rounded-xl p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(VIEW_BLOCK_LABELS) as CompetitionViewBlockType[]).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addViewBlock(viewIndex, type)}
                        className="btn btn-secondary btn-sm"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {VIEW_BLOCK_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function StudioHeading({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

function FieldCollection({
  fields,
  onChange,
  onAdd,
}: {
  fields: CompetitionFieldDefinition[]
  onChange: (fields: CompetitionFieldDefinition[]) => void
  onAdd: () => void
}) {
  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <div key={`${field.id}-${index}`} className="grid gap-3 rounded-2xl border border-sage-200 p-4 md:grid-cols-[1fr_160px_100px_auto]">
          <input
            className="form-input"
            value={field.label}
            onChange={event => {
              const next = [...fields]
              next[index] = {
                ...field,
                label: event.target.value,
              }
              onChange(next)
            }}
            placeholder="Nazwa pola"
          />
          <select
            className="form-input"
            value={field.type}
            onChange={event => {
              const next = [...fields]
              next[index] = { ...field, type: event.target.value as CompetitionFieldType }
              onChange(next)
            }}
          >
            {(Object.keys(FIELD_TYPE_LABELS) as CompetitionFieldType[]).map(type => (
              <option key={type} value={type}>{FIELD_TYPE_LABELS[type]}</option>
            ))}
          </select>
          <input
            className="form-input"
            value={field.unit ?? ''}
            onChange={event => {
              const next = [...fields]
              next[index] = { ...field, unit: event.target.value || undefined }
              onChange(next)
            }}
            placeholder="Jednostka"
          />
          <button
            type="button"
            onClick={() => onChange(fields.filter((_, itemIndex) => itemIndex !== index))}
            className="rounded-xl p-3 text-muted-foreground hover:bg-red-50 hover:text-red-600"
            title="Usuń pole"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd} className="btn btn-secondary btn-sm">
        <Plus className="h-4 w-4" />
        Dodaj pole
      </button>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-sage-300 bg-sage-50 p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
