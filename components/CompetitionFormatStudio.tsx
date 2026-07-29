'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calculator, Eye, Flag, Layers3, Plus, Save, Trash2 } from 'lucide-react'
import {
  SPEEDWAY_FORMAT,
  TIME_TRIAL_FORMAT,
  VERSATILE_DOG_CUP_FORMAT,
} from '@/lib/competitionPresets'
import {
  buildWeightedScoreExpression,
  describeWeightedScoreRecipe,
  parseWeightedScoreExpression,
} from '@/lib/competitionFormulaBuilder'
import type {
  ScoreAggregation,
  WeightedScoreRecipe,
} from '@/lib/competitionFormulaBuilder'
import type {
  CompetitionComputedFieldDefinition,
  CompetitionExpression,
  CompetitionFieldDefinition,
  CompetitionFieldType,
  CompetitionFormatDefinition,
  CompetitionViewBlockType,
} from '@/types/competition'
import { validateCompetitionFormatDefinition } from '@/lib/competitionEngine'

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
  duration_ms: 'Czas (sekundy)',
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

const RANKING_VIEW_BLOCKS = new Set<CompetitionViewBlockType>([
  'leaderboard',
  'podium',
  'result_table',
  'metric',
])
const FIELD_VIEW_BLOCKS = new Set<CompetitionViewBlockType>([
  'leaderboard',
  'result_table',
  'metric',
])
const LIMITED_VIEW_BLOCKS = new Set<CompetitionViewBlockType>([
  'next_up',
  'leaderboard',
  'result_table',
  'podium',
])

const AGGREGATION_LABELS: Record<ScoreAggregation, string> = {
  min: 'Najniższy wynik',
  max: 'Najwyższy wynik',
  sum: 'Suma ze wszystkich prób',
  average: 'Średnia z prób',
}

type RankingThreshold = {
  metricId: string
  operator: 'gt' | 'gte' | 'lt' | 'lte'
  value: number
}

function rankingThresholdDetails(
  expression: CompetitionExpression | undefined,
): RankingThreshold | null {
  if (
    !expression
    || !['gt', 'gte', 'lt', 'lte'].includes(expression.op)
    || !('left' in expression)
    || expression.left.op !== 'ref'
    || !expression.left.path.startsWith('computed.')
    || expression.right.op !== 'literal'
    || typeof expression.right.value !== 'number'
  ) {
    return null
  }
  const metricId = expression.left.path.split('.').at(-1)
  if (!metricId) return null
  return {
    metricId,
    operator: expression.op as RankingThreshold['operator'],
    value: expression.right.value,
  }
}

function studioStepForIssuePath(path: string): StudioStep {
  if (path.startsWith('computedFields')) return 'calculations'
  if (path.startsWith('rankings') || path.startsWith('groups')) return 'ranking'
  if (path.startsWith('views')) return 'views'
  return 'data'
}

function issueAreaLabel(step: StudioStep) {
  return STEPS.find(candidate => candidate.id === step)?.label ?? 'konfigurację'
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
  const pointResultFields = definition.resultFields.filter(field => field.type === 'number')
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
    const removedFields = definition[collection].filter(field =>
      !fields.some(nextField => nextField.id === field.id)
    )
    const referencedField = removedFields.find(field =>
      definition.computedFields.some(computedField =>
        JSON.stringify(computedField.expression).includes(
          `${collection === 'eventFields' ? 'event' : 'values'}.${field.id}`,
        )
      )
    )
    if (referencedField) {
      const computedField = definition.computedFields.find(candidate =>
        JSON.stringify(candidate.expression).includes(
          `${collection === 'eventFields' ? 'event' : 'values'}.${referencedField.id}`,
        )
      )
      setError(
        `Nie można usunąć pola „${referencedField.label}”, ponieważ korzysta z niego wynik „${computedField?.label ?? 'obliczany'}”. Najpierw zmień obliczenia.`,
      )
      return
    }
    setError(null)
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

  function addWeightedScore() {
    const source = pointResultFields[0]
    if (!source) {
      setError('Najpierw dodaj co najmniej jedno pole wyniku typu „Liczba”.')
      setStep('data')
      return
    }
    const metricId = nextIdentifier(
      definition.computedFields.map(field => field.id),
      'total_points',
    )
    updateDefinition({
      computedFields: [
        ...definition.computedFields,
        {
          id: metricId,
          label: 'Punkty końcowe',
          type: 'number',
          expression: buildWeightedScoreExpression({
            precision: 1,
            terms: [{
              fieldId: source.id,
              aggregation: 'sum',
              operation: 'add',
              multiplier: 1,
            }],
          }),
          unit: 'pkt',
          precision: 1,
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

  function updateWeightedScore(index: number, recipe: WeightedScoreRecipe) {
    updateComputedField(index, {
      type: 'number',
      precision: recipe.precision,
      expression: buildWeightedScoreExpression(recipe),
    })
  }

  function updateRankingThreshold(
    rankingIndex: number,
    threshold: RankingThreshold | null,
  ) {
    const rankings = [...definition.rankings]
    rankings[rankingIndex] = {
      ...rankings[rankingIndex],
      eligibility: threshold
        ? {
            op: threshold.operator,
            left: { op: 'ref', path: `computed.${threshold.metricId}` },
            right: { op: 'literal', value: threshold.value },
          }
        : undefined,
    }
    updateDefinition({ rankings })
  }

  function addRankingCriterion(rankingIndex: number) {
    const ranking = definition.rankings[rankingIndex]
    const usedMetrics = new Set(ranking.orderBy
      .filter(order => order.expression.op === 'ref')
      .map(order => order.expression.op === 'ref'
        ? order.expression.path.split('.').at(-1)
        : null))
    const metric = computedOptions.find(option => !usedMetrics.has(option.id))
      ?? computedOptions[0]
    if (!metric) return
    const rankings = [...definition.rankings]
    rankings[rankingIndex] = {
      ...ranking,
      orderBy: [
        ...ranking.orderBy,
        {
          expression: { op: 'ref', path: `computed.${metric.id}` },
          direction: 'desc',
          nulls: 'last',
        },
      ],
    }
    updateDefinition({ rankings })
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
      rankingId: RANKING_VIEW_BLOCKS.has(type)
        ? definition.rankings[0]?.id
        : undefined,
      fields: FIELD_VIEW_BLOCKS.has(type)
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
    setError(null)
    const nextDefinition = { ...definition, name: name.trim() }
    if (!name.trim()) {
      setError('Nadaj formatowi nazwę w panelu po lewej.')
      return
    }
    const validation = validateCompetitionFormatDefinition(nextDefinition)
    if (!validation.success) {
      const firstIssue = validation.issues[0]
      const issueStep = studioStepForIssuePath(firstIssue.path)
      setStep(issueStep)
      setError(
        `Sprawdź sekcję „${issueAreaLabel(issueStep)}”: ${firstIssue.message}`,
      )
      return
    }
    setSaving(status)
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
              <p className="form-label">Od czego chcesz zacząć?</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Wybierz najbliższy przykład. Wszystkie nazwy i zasady możesz później zmienić.
              </p>
              <div className="grid gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-sage-200 bg-white p-3 text-left transition hover:border-accent hover:bg-orange-50"
                  onClick={() => applyStarterPreset(
                    TIME_TRIAL_FORMAT,
                    'Uniwersalny format dwóch prób czasowych.',
                  )}
                >
                  <span className="block text-sm font-bold">Próba czasowa</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Najlepszy czas z kilku podejść.
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-sage-200 bg-white p-3 text-left transition hover:border-accent hover:bg-orange-50"
                  onClick={() => applyStarterPreset(
                    SPEEDWAY_FORMAT,
                    'Dwie próby, klasy XS–XL, najlepszy czas i prędkość.',
                  )}
                >
                  <span className="block text-sm font-bold">Speedway</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Dwie próby i ranking w klasach wzrostowych.
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-left transition hover:border-violet-400"
                  onClick={() => applyStarterPreset(
                    VERSATILE_DOG_CUP_FORMAT,
                    'Ważone konkurencje, bonus, kary, próg klasyfikacji i dogrywka.',
                  )}
                >
                  <span className="block text-sm font-bold text-violet-900">Puchar punktowy</span>
                  <span className="mt-0.5 block text-xs text-violet-700">
                    Wagi, bonusy, kary i rozstrzyganie remisów.
                  </span>
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
          <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
            <p className="form-label">Szybkie podsumowanie</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Pola wpisywane przez obsługę</dt>
                <dd className="font-bold">{definition.resultFields.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Obliczane wyniki</dt>
                <dd className="font-bold">{definition.computedFields.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Kryteria kolejności</dt>
                <dd className="font-bold">
                  {definition.rankings.reduce((sum, ranking) => sum + ranking.orderBy.length, 0)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Bloki publicznych widoków</dt>
                <dd className="font-bold">
                  {definition.views.reduce((sum, view) => sum + view.blocks.length, 0)}
                </dd>
              </div>
            </dl>
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
              <StudioHeading
                title="1. Ustawienia wspólne dla całego wydarzenia"
                description="Dodaj tylko wartości, które organizator poda raz, np. długość toru albo limit punktów."
              />
              <FieldCollection
                fields={definition.eventFields}
                onChange={fields => updateFields('eventFields', fields)}
                onAdd={() => addField('eventFields')}
                addLabel="Dodaj ustawienie wydarzenia"
              />

              <StudioHeading
                title="2. Co sędzia lub operator będzie wpisywać?"
                description="Każde pole pojawi się przy zawodniku, np. czas, punkty za technikę, bonus lub kara."
              />
              <FieldCollection
                fields={definition.resultFields}
                onChange={fields => updateFields('resultFields', fields)}
                onAdd={() => addField('resultFields')}
                addLabel="Dodaj pole wyniku"
              />

              <StudioHeading
                title="3. Ile razy oceniany jest każdy zawodnik?"
                description="Nazwij etap i próby tak, jak mówi o nich obsługa zawodów. Te nazwy zobaczy operator."
              />
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
              <div className="space-y-3 rounded-2xl border border-sage-200 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-sage-500">
                  Nazwy prób
                </p>
                {definition.stages[0]?.attempts.map((attempt, attemptIndex) => (
                  <label key={attempt.id} className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
                    <span className="text-sm font-semibold text-sage-700">
                      Próba {attemptIndex + 1}
                    </span>
                    <input
                      className="form-input"
                      value={attempt.label}
                      onChange={event => {
                        const stages = structuredClone(definition.stages)
                        stages[0].attempts[attemptIndex].label = event.target.value
                        updateDefinition({ stages })
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 'calculations' && (
            <div className="space-y-5">
              <StudioHeading
                title="Jak powstaje wynik zawodnika?"
                description="Dodaj prosty wynik z prób albo zbuduj punktację z wagami, bonusami i karami. Nie musisz pisać formuł."
                action={(
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={addComputedField} className="btn btn-secondary btn-sm">
                      <Plus className="h-4 w-4" />
                      Najlepszy / suma / średnia
                    </button>
                    <button type="button" onClick={addWeightedScore} className="btn btn-primary btn-sm">
                      <Plus className="h-4 w-4" />
                      Punktacja z wagami i karami
                    </button>
                  </div>
                )}
              />
              {definition.computedFields.map((field, index) => {
                const reducer = reducerDetails(field)
                const weightedRecipe = parseWeightedScoreExpression(field.expression)
                if (weightedRecipe) {
                  return (
                    <WeightedScoreEditor
                      key={field.id}
                      field={field}
                      recipe={weightedRecipe}
                      resultFields={pointResultFields}
                      onFieldChange={patch => updateComputedField(index, patch)}
                      onRecipeChange={recipe => updateWeightedScore(index, recipe)}
                      onRemove={() => removeComputedField(index)}
                    />
                  )
                }
                return (
                  <div key={field.id} className="space-y-4 rounded-2xl border border-sage-200 p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_120px_100px_auto]">
                      <label>
                        <span className="form-label text-xs">Nazwa wyniku</span>
                        <input
                          className="form-input"
                          value={field.label}
                          onChange={event => updateComputedField(index, {
                            label: event.target.value,
                          })}
                          placeholder="Nazwa wyniku"
                        />
                      </label>
                      <label>
                        <span className="form-label text-xs">Jednostka</span>
                        <input
                          className="form-input"
                          value={field.unit ?? ''}
                          onChange={event => updateComputedField(index, {
                            unit: event.target.value || undefined,
                          })}
                          placeholder="pkt, s"
                        />
                      </label>
                      <label>
                        <span className="form-label text-xs">Precyzja</span>
                        <input
                          className="form-input"
                          type="number"
                          min={0}
                          max={8}
                          value={field.precision ?? ''}
                          onChange={event => updateComputedField(index, {
                            precision: event.target.value === '' ? undefined : Number(event.target.value),
                          })}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeComputedField(index)}
                        className="mt-6 rounded-xl p-3 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        title="Usuń wynik"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {reducer ? (
                      <div className="grid gap-3 rounded-xl bg-sage-50 p-3 sm:grid-cols-2">
                        <label>
                          <span className="form-label text-xs">Jak połączyć próby?</span>
                        <select
                          className="form-input"
                          value={reducer.operator}
                          onChange={event => updateReducer(index, event.target.value as ReducerOperator, reducer.source)}
                        >
                            {(Object.keys(AGGREGATION_LABELS) as ScoreAggregation[]).map(operator => (
                              <option key={operator} value={operator}>{AGGREGATION_LABELS[operator]}</option>
                            ))}
                        </select>
                        </label>
                        <label>
                          <span className="form-label text-xs">Z którego pola?</span>
                        <select
                          className="form-input"
                          value={reducer.source}
                          onChange={event => updateReducer(index, reducer.operator, event.target.value)}
                        >
                          {numericResultFields.map(resultField => (
                            <option key={resultField.id} value={resultField.id}>{resultField.label}</option>
                          ))}
                        </select>
                        </label>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-violet-50 p-3 text-sm text-violet-700">
                        Ta metryka korzysta z zaawansowanej reguły dostarczonej przez szablon.
                        Możesz zmienić jej nazwę i sposób prezentacji.
                      </div>
                    )}
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
              <StudioHeading
                title="Kto wygrywa i co dzieje się przy remisie?"
                description="Kryteria są sprawdzane po kolei. Drugie i kolejne działają tylko wtedy, gdy wcześniejsze wyniki są równe."
              />
              {definition.rankings.map((ranking, index) => {
                const threshold = rankingThresholdDetails(ranking.eligibility)
                return (
                  <div key={ranking.id} className="space-y-6 rounded-2xl border border-sage-200 bg-sage-50 p-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label>
                        <span className="form-label">Nazwa klasyfikacji</span>
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
                        <span className="form-label">Jak numerować prawdziwy remis?</span>
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
                          <option value="competition">Wspólne miejsce, potem luka: 1, 2, 2, 4</option>
                          <option value="dense">Wspólne miejsce, bez luki: 1, 2, 2, 3</option>
                          <option value="ordinal">Zawsze osobne miejsca: 1, 2, 3, 4</option>
                        </select>
                      </label>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-sage-500">
                        Kolejność porównywania
                      </p>
                      {ranking.orderBy.map((order, orderIndex) => {
                        const selectedMetric = order.expression.op === 'ref'
                          ? order.expression.path.split('.').at(-1) ?? ''
                          : ''
                        return (
                          <div
                            key={`${ranking.id}-order-${orderIndex}`}
                            className="grid gap-3 rounded-xl border border-sage-200 bg-white p-3 sm:grid-cols-[150px_1fr_180px_auto]"
                          >
                            <div className="flex items-center text-sm font-bold text-sage-700">
                              {orderIndex === 0 ? '1. Główny wynik' : `${orderIndex + 1}. Rozstrzygnięcie remisu`}
                            </div>
                            {selectedMetric ? (
                              <select
                                className="form-input"
                                value={selectedMetric}
                                onChange={event => {
                                  const rankings = [...definition.rankings]
                                  rankings[index] = {
                                    ...ranking,
                                    orderBy: ranking.orderBy.map((criterion, criterionIndex) =>
                                      criterionIndex === orderIndex
                                        ? {
                                            ...criterion,
                                            expression: {
                                              op: 'ref',
                                              path: `computed.${event.target.value}`,
                                            },
                                          }
                                        : criterion
                                    ),
                                  }
                                  updateDefinition({ rankings })
                                }}
                              >
                                {computedOptions.map(option => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="flex items-center rounded-xl bg-violet-50 px-3 text-xs font-semibold text-violet-700">
                                Kryterium z szablonu
                              </div>
                            )}
                            <select
                              className="form-input"
                              value={order.direction}
                              onChange={event => {
                                const rankings = [...definition.rankings]
                                rankings[index] = {
                                  ...ranking,
                                  orderBy: ranking.orderBy.map((criterion, criterionIndex) =>
                                    criterionIndex === orderIndex
                                      ? {
                                          ...criterion,
                                          direction: event.target.value as 'asc' | 'desc',
                                        }
                                      : criterion
                                  ),
                                }
                                updateDefinition({ rankings })
                              }}
                            >
                              <option value="desc">Więcej = lepiej</option>
                              <option value="asc">Mniej = lepiej</option>
                            </select>
                            <button
                              type="button"
                              disabled={orderIndex === 0}
                              onClick={() => {
                                const rankings = [...definition.rankings]
                                rankings[index] = {
                                  ...ranking,
                                  orderBy: ranking.orderBy.filter((_, criterionIndex) =>
                                    criterionIndex !== orderIndex
                                  ),
                                }
                                updateDefinition({ rankings })
                              }}
                              className="rounded-xl p-3 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-20"
                              title="Usuń kryterium"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => addRankingCriterion(index)}
                        disabled={computedOptions.length === 0}
                        className="btn btn-secondary btn-sm"
                      >
                        <Plus className="h-4 w-4" />
                        Dodaj sposób rozstrzygania remisu
                      </button>
                    </div>

                    <div className="space-y-3 border-t border-sage-200 pt-5">
                      <div>
                        <p className="font-semibold text-foreground">Próg wejścia do klasyfikacji</p>
                        <p className="text-xs text-muted-foreground">
                          Opcjonalnie pozostaw bez miejsca zawodników, którzy nie osiągnęli minimum.
                        </p>
                      </div>
                      {threshold ? (
                        <div className="grid gap-3 rounded-xl border border-sage-200 bg-white p-3 sm:grid-cols-[1fr_190px_140px_auto]">
                          <select
                            className="form-input"
                            value={threshold.metricId}
                            onChange={event => updateRankingThreshold(index, {
                              ...threshold,
                              metricId: event.target.value,
                            })}
                          >
                            {computedOptions.map(option => (
                              <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                          </select>
                          <select
                            className="form-input"
                            value={threshold.operator}
                            onChange={event => updateRankingThreshold(index, {
                              ...threshold,
                              operator: event.target.value as RankingThreshold['operator'],
                            })}
                          >
                            <option value="gte">co najmniej</option>
                            <option value="gt">więcej niż</option>
                            <option value="lte">co najwyżej</option>
                            <option value="lt">mniej niż</option>
                          </select>
                          <input
                            className="form-input"
                            type="number"
                            value={threshold.value}
                            onChange={event => updateRankingThreshold(index, {
                              ...threshold,
                              value: Number(event.target.value),
                            })}
                          />
                          <button
                            type="button"
                            onClick={() => updateRankingThreshold(index, null)}
                            className="rounded-xl p-3 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            title="Usuń próg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : ranking.eligibility ? (
                        <div className="rounded-xl bg-violet-50 p-3 text-sm text-violet-700">
                          Ten szablon ma bardziej złożoną regułę kwalifikacji, np. odprawę zawodnika.
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={computedOptions.length === 0}
                          onClick={() => computedOptions[0] && updateRankingThreshold(index, {
                            metricId: computedOptions[0].id,
                            operator: 'gte',
                            value: 0,
                          })}
                        >
                          <Plus className="h-4 w-4" />
                          Dodaj próg
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {step === 'views' && (
            <div className="space-y-8">
              <StudioHeading
                title="Co zobaczą uczestnicy?"
                description="Każdy blok jest gotowym elementem strony. Wybierz ranking i dane, które mają się w nim pojawić."
              />
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
                      <article key={block.id} className="space-y-4 rounded-2xl border border-sage-200 p-4">
                        <div className="grid items-end gap-3 sm:grid-cols-[auto_1fr_auto_auto]">
                          <Eye className="mb-3 h-4 w-4 shrink-0 text-accent" />
                          <label>
                            <span className="form-label text-xs">Tytuł sekcji</span>
                            <input
                              className="form-input"
                              value={block.title ?? ''}
                              onChange={event => {
                                const views = structuredClone(definition.views)
                                views[viewIndex].blocks[blockIndex].title = event.target.value
                                updateDefinition({ views })
                              }}
                            />
                          </label>
                          <span className="mb-2 shrink-0 rounded-full bg-sage-100 px-3 py-1 text-xs font-semibold text-sage-700">
                            {VIEW_BLOCK_LABELS[block.type]}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const views = structuredClone(definition.views)
                              views[viewIndex].blocks.splice(blockIndex, 1)
                              updateDefinition({ views })
                            }}
                            className="mb-1 rounded-xl p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            title="Usuń blok"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {(RANKING_VIEW_BLOCKS.has(block.type) || FIELD_VIEW_BLOCKS.has(block.type) || LIMITED_VIEW_BLOCKS.has(block.type)) && (
                          <div className="space-y-4 rounded-xl bg-sage-50 p-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              {RANKING_VIEW_BLOCKS.has(block.type) && (
                                <label>
                                  <span className="form-label text-xs">Która klasyfikacja?</span>
                                  <select
                                    className="form-input"
                                    value={block.rankingId ?? ''}
                                    onChange={event => {
                                      const views = structuredClone(definition.views)
                                      views[viewIndex].blocks[blockIndex].rankingId = event.target.value || undefined
                                      updateDefinition({ views })
                                    }}
                                  >
                                    <option value="">Bez klasyfikacji</option>
                                    {definition.rankings.map(ranking => (
                                      <option key={ranking.id} value={ranking.id}>{ranking.label}</option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              {LIMITED_VIEW_BLOCKS.has(block.type) && (
                                <label>
                                  <span className="form-label text-xs">Maksymalna liczba pozycji</span>
                                  <input
                                    className="form-input"
                                    type="number"
                                    min={1}
                                    max={1000}
                                    value={block.limit ?? ''}
                                    placeholder="Bez limitu"
                                    onChange={event => {
                                      const views = structuredClone(definition.views)
                                      views[viewIndex].blocks[blockIndex].limit = event.target.value === ''
                                        ? undefined
                                        : Math.max(1, Number(event.target.value))
                                      updateDefinition({ views })
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                            {FIELD_VIEW_BLOCKS.has(block.type) && (
                              <fieldset>
                                <legend className="form-label text-xs">Pokazywane wyniki</legend>
                                <div className="flex flex-wrap gap-2">
                                  {definition.computedFields.map(computedField => {
                                    const path = `computed.${computedField.id}`
                                    const selected = block.fields?.includes(path) ?? false
                                    return (
                                      <label
                                        key={computedField.id}
                                        className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                          selected
                                            ? 'border-accent bg-orange-50 text-accent'
                                            : 'border-sage-200 bg-white text-sage-600'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selected}
                                          onChange={event => {
                                            const views = structuredClone(definition.views)
                                            const currentFields = views[viewIndex].blocks[blockIndex].fields ?? []
                                            views[viewIndex].blocks[blockIndex].fields = event.target.checked
                                              ? [...currentFields, path]
                                              : currentFields.filter(fieldPath => fieldPath !== path)
                                            updateDefinition({ views })
                                          }}
                                          className="sr-only"
                                        />
                                        {computedField.label}
                                      </label>
                                    )
                                  })}
                                </div>
                              </fieldset>
                            )}
                          </div>
                        )}
                      </article>
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

function WeightedScoreEditor({
  field,
  recipe,
  resultFields,
  onFieldChange,
  onRecipeChange,
  onRemove,
}: {
  field: CompetitionComputedFieldDefinition
  recipe: WeightedScoreRecipe
  resultFields: CompetitionFieldDefinition[]
  onFieldChange: (patch: Partial<CompetitionComputedFieldDefinition>) => void
  onRecipeChange: (recipe: WeightedScoreRecipe) => void
  onRemove: () => void
}) {
  const labels = Object.fromEntries(resultFields.map(resultField => [
    resultField.id,
    resultField.label,
  ]))
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({})
  const sampleFieldIds = [...new Set(recipe.terms.map(term => term.fieldId))]
  const sampleTotal = recipe.terms.reduce((total, term) => {
    const rawValue = Number(sampleValues[term.fieldId] ?? 0)
    const value = Number.isFinite(rawValue) ? rawValue : 0
    return total + value * term.multiplier * (term.operation === 'subtract' ? -1 : 1)
  }, 0)
  const roundedSampleTotal = Math.round(sampleTotal * 10 ** recipe.precision)
    / 10 ** recipe.precision

  function updateTerm(
    index: number,
    patch: Partial<WeightedScoreRecipe['terms'][number]>,
  ) {
    const terms = [...recipe.terms]
    terms[index] = { ...terms[index], ...patch }
    onRecipeChange({ ...recipe, terms })
  }

  return (
    <article className="space-y-5 rounded-2xl border-2 border-violet-200 bg-violet-50/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-600">
            Punktacja z wagami i karami
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Każdy wiersz dodaje albo odejmuje część wyniku.
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl p-3 text-muted-foreground hover:bg-red-50 hover:text-red-600"
          title="Usuń wynik"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
        <label>
          <span className="form-label text-xs">Nazwa wyniku końcowego</span>
          <input
            className="form-input"
            value={field.label}
            onChange={event => onFieldChange({ label: event.target.value })}
          />
        </label>
        <label>
          <span className="form-label text-xs">Jednostka</span>
          <input
            className="form-input"
            value={field.unit ?? ''}
            onChange={event => onFieldChange({ unit: event.target.value || undefined })}
            placeholder="pkt"
          />
        </label>
        <label>
          <span className="form-label text-xs">Miejsca po przecinku</span>
          <input
            className="form-input"
            type="number"
            min={0}
            max={8}
            value={recipe.precision}
            onChange={event => onRecipeChange({
              ...recipe,
              precision: Math.max(0, Math.min(8, Number(event.target.value))),
            })}
          />
        </label>
      </div>

      <div className="space-y-3">
        {recipe.terms.map((term, termIndex) => (
          <div
            key={`${term.fieldId}-${termIndex}`}
            className="grid gap-3 rounded-xl border border-violet-100 bg-white p-3 lg:grid-cols-[130px_1fr_190px_120px_auto]"
          >
            <label>
              <span className="form-label text-xs">Działanie</span>
              <select
                className="form-input"
                value={term.operation}
                onChange={event => updateTerm(termIndex, {
                  operation: event.target.value as WeightedScoreRecipe['terms'][number]['operation'],
                })}
              >
                <option value="add">Dodaj</option>
                <option value="subtract">Odejmij jako karę</option>
              </select>
            </label>
            <label>
              <span className="form-label text-xs">Pole wyniku</span>
              <select
                className="form-input"
                value={term.fieldId}
                onChange={event => updateTerm(termIndex, { fieldId: event.target.value })}
              >
                {resultFields.map(resultField => (
                  <option key={resultField.id} value={resultField.id}>
                    {resultField.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="form-label text-xs">Gdy jest kilka prób</span>
              <select
                className="form-input"
                value={term.aggregation}
                onChange={event => updateTerm(termIndex, {
                  aggregation: event.target.value as ScoreAggregation,
                })}
              >
                {(Object.keys(AGGREGATION_LABELS) as ScoreAggregation[]).map(aggregation => (
                  <option key={aggregation} value={aggregation}>
                    {AGGREGATION_LABELS[aggregation]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="form-label text-xs">Mnożnik / waga</span>
              <input
                className="form-input"
                type="number"
                min={0}
                step="0.1"
                value={term.multiplier}
                onChange={event => updateTerm(termIndex, {
                  multiplier: Math.max(0, Number(event.target.value)),
                })}
              />
            </label>
            <button
              type="button"
              disabled={recipe.terms.length === 1}
              onClick={() => onRecipeChange({
                ...recipe,
                terms: recipe.terms.filter((_, index) => index !== termIndex),
              })}
              className="mt-6 rounded-xl p-3 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
              title="Usuń składnik"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={resultFields.length === 0}
        onClick={() => {
          const fieldId = resultFields.find(resultField =>
            !recipe.terms.some(term => term.fieldId === resultField.id)
          )?.id ?? resultFields[0]?.id
          if (!fieldId) return
          onRecipeChange({
            ...recipe,
            terms: [
              ...recipe.terms,
              {
                fieldId,
                aggregation: 'sum',
                operation: 'add',
                multiplier: 1,
              },
            ],
          })
        }}
      >
        <Plus className="h-4 w-4" />
        Dodaj składnik punktacji
      </button>

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-600">
          Tak zostanie policzony wynik
        </p>
        <p className="mt-2 font-mono text-sm font-semibold text-violet-900">
          {field.label} = {describeWeightedScoreRecipe(recipe, labels)}
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-sage-200 bg-white p-4">
        <div>
          <p className="text-sm font-bold text-foreground">Szybki test na jednej próbie</p>
          <p className="text-xs text-muted-foreground">
            Wpisz przykładowe wartości i sprawdź, czy wynik zachowuje się tak, jak oczekujesz.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sampleFieldIds.map(fieldId => (
            <label key={fieldId}>
              <span className="form-label text-xs">{labels[fieldId] ?? fieldId}</span>
              <input
                className="form-input"
                type="number"
                value={sampleValues[fieldId] ?? ''}
                onChange={event => setSampleValues(current => ({
                  ...current,
                  [fieldId]: event.target.value,
                }))}
                placeholder="0"
              />
            </label>
          ))}
        </div>
        <div className="rounded-xl bg-green-50 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-green-700">
            Przykładowy wynik
          </p>
          <p className="mt-1 text-3xl font-bold text-green-800">
            {roundedSampleTotal} {field.unit ?? ''}
          </p>
        </div>
      </div>
    </article>
  )
}

function FieldCollection({
  fields,
  onChange,
  onAdd,
  addLabel,
}: {
  fields: CompetitionFieldDefinition[]
  onChange: (fields: CompetitionFieldDefinition[]) => void
  onAdd: () => void
  addLabel: string
}) {
  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <article key={`${field.id}-${index}`} className="space-y-4 rounded-2xl border border-sage-200 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_120px_auto]">
            <label>
              <span className="form-label text-xs">Nazwa widoczna dla operatora</span>
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
                placeholder="Np. Punkty za technikę"
              />
            </label>
            <label>
              <span className="form-label text-xs">Rodzaj danych</span>
              <select
                className="form-input"
                value={field.type}
                onChange={event => {
                  const next = [...fields]
                  next[index] = {
                    ...field,
                    type: event.target.value as CompetitionFieldType,
                  }
                  onChange(next)
                }}
              >
                {(Object.keys(FIELD_TYPE_LABELS) as CompetitionFieldType[]).map(type => (
                  <option key={type} value={type}>{FIELD_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="form-label text-xs">Jednostka</span>
              <input
                className="form-input"
                value={field.unit ?? ''}
                onChange={event => {
                  const next = [...fields]
                  next[index] = { ...field, unit: event.target.value || undefined }
                  onChange(next)
                }}
                placeholder="pkt, m, s"
              />
            </label>
            <button
              type="button"
              onClick={() => onChange(fields.filter((_, itemIndex) => itemIndex !== index))}
              className="mt-6 rounded-xl p-3 text-muted-foreground hover:bg-red-50 hover:text-red-600"
              title="Usuń pole"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 rounded-xl bg-sage-50 p-3 sm:grid-cols-4">
            <label className="flex items-center gap-2 text-sm font-medium text-sage-700">
              <input
                type="checkbox"
                checked={field.required === true}
                onChange={event => {
                  const next = [...fields]
                  next[index] = { ...field, required: event.target.checked }
                  onChange(next)
                }}
                className="h-4 w-4 rounded border-sage-300"
              />
              Pole wymagane
            </label>
            {(field.type === 'number' || field.type === 'duration_ms') && (
              <>
                <label>
                  <span className="form-label text-xs">Minimum</span>
                  <input
                    className="form-input"
                    type="number"
                    value={field.min ?? ''}
                    onChange={event => {
                      const next = [...fields]
                      next[index] = {
                        ...field,
                        min: event.target.value === '' ? undefined : Number(event.target.value),
                      }
                      onChange(next)
                    }}
                  />
                </label>
                <label>
                  <span className="form-label text-xs">Maksimum</span>
                  <input
                    className="form-input"
                    type="number"
                    value={field.max ?? ''}
                    onChange={event => {
                      const next = [...fields]
                      next[index] = {
                        ...field,
                        max: event.target.value === '' ? undefined : Number(event.target.value),
                      }
                      onChange(next)
                    }}
                  />
                </label>
                <label>
                  <span className="form-label text-xs">Miejsca po przecinku</span>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    max={8}
                    value={field.precision ?? ''}
                    onChange={event => {
                      const next = [...fields]
                      next[index] = {
                        ...field,
                        precision: event.target.value === '' ? undefined : Number(event.target.value),
                      }
                      onChange(next)
                    }}
                  />
                </label>
              </>
            )}
          </div>
        </article>
      ))}
      <button type="button" onClick={onAdd} className="btn btn-secondary btn-sm">
        <Plus className="h-4 w-4" />
        {addLabel}
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
