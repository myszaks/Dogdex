import {
  Calculator,
  Eye,
  Flag,
  Layers3,
  ListChecks,
  SlidersHorizontal,
} from 'lucide-react'
import {
  competitionFieldLabels,
  describeCompetitionExpression,
} from '@/lib/competitionFormatPresentation'
import { plForm } from '@/lib/utils'
import type {
  CompetitionFieldDefinition,
  CompetitionFormatDefinition,
} from '@/types/competition'

const FIELD_TYPES = {
  number: 'liczba',
  duration_ms: 'czas',
  text: 'tekst',
  boolean: 'tak / nie',
}

function Fields({
  fields,
  empty,
  definition,
}: {
  fields: CompetitionFieldDefinition[]
  empty: string
  definition?: CompetitionFormatDefinition
}) {
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map(field => (
        <div key={field.id} className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3">
          <p className="font-semibold text-foreground">{field.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {FIELD_TYPES[field.type]}
            {field.unit ? ` · ${field.unit}` : ''}
            {field.required ? ' · wymagane' : ' · opcjonalne'}
          </p>
          {definition && (
            <p className="mt-1 text-xs text-sage-600">
              {field.stageIds === undefined
                ? 'Wpisywane we wszystkich etapach'
                : `Etap: ${field.stageIds
                  .map(stageId =>
                    definition.stages.find(stage => stage.id === stageId)?.label ?? stageId
                  )
                  .join(', ')}`}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export default function CompetitionFormatPreview({
  definition,
}: {
  definition: CompetitionFormatDefinition
}) {
  const labels = competitionFieldLabels(definition)

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <PreviewSection
        Icon={SlidersHorizontal}
        eyebrow="Przed rozpoczęciem"
        title="Parametry wydarzenia"
      >
        <Fields
          fields={definition.eventFields}
          empty="Ten format nie wymaga dodatkowych parametrów wydarzenia."
        />
      </PreviewSection>

      <PreviewSection
        Icon={ListChecks}
        eyebrow="Obsługa na żywo"
        title="Dane wpisywane przez operatora"
      >
        <Fields
          fields={definition.resultFields}
          empty="Operator nie wpisuje dodatkowych pól wyniku."
          definition={definition}
        />
      </PreviewSection>

      <PreviewSection
        Icon={Layers3}
        eyebrow="Przebieg"
        title="Etapy i próby"
      >
        <div className="space-y-2">
          {definition.stages.map(stage => (
            <div key={stage.id} className="rounded-xl border border-sage-200 px-4 py-3">
              <p className="font-semibold">{stage.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {plForm(stage.attempts.length, 'próba', 'próby', 'prób')}:
                {' '}{stage.attempts.map(attempt => attempt.label).join(', ')}
              </p>
            </div>
          ))}
        </div>
      </PreviewSection>

      <PreviewSection
        Icon={Calculator}
        eyebrow="Silnik obliczeniowy"
        title="Obliczenia"
      >
        <div className="space-y-2">
          {definition.computedFields.map(field => (
            <div key={field.id} className="rounded-xl border border-sage-200 px-4 py-3">
              <p className="font-semibold">{field.label}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {describeCompetitionExpression(field.expression, labels)}
                {field.unit ? ` · wynik w ${field.unit}` : ''}
              </p>
            </div>
          ))}
          {definition.computedFields.length === 0 && (
            <p className="text-sm text-muted-foreground">Brak automatycznych obliczeń.</p>
          )}
        </div>
      </PreviewSection>

      <PreviewSection
        Icon={Flag}
        eyebrow="Klasyfikacja"
        title="Rankingi i grupy"
      >
        <div className="space-y-2">
          {definition.rankings.map(ranking => (
            <div key={ranking.id} className="rounded-xl border border-sage-200 px-4 py-3">
              <p className="font-semibold">{ranking.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {plForm(ranking.orderBy.length, 'kryterium', 'kryteria', 'kryteriów')}
                {ranking.groupBy.length > 0
                  ? ` · grupowanie według: ${ranking.groupBy
                    .map(groupId => definition.groups.find(group => group.id === groupId)?.label ?? groupId)
                    .join(', ')}`
                  : ' · bez podziału na grupy'}
              </p>
            </div>
          ))}
          {definition.rankings.length === 0 && (
            <p className="text-sm text-muted-foreground">Brak klasyfikacji.</p>
          )}
        </div>
      </PreviewSection>

      <PreviewSection
        Icon={Eye}
        eyebrow="Prezentacja"
        title="Widoki wyników"
      >
        <div className="space-y-2">
          {definition.views.map(view => (
            <div key={view.id} className="rounded-xl border border-sage-200 px-4 py-3">
              <p className="font-semibold">{view.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {view.kind === 'live' ? 'Widok na żywo' : 'Widok wyników końcowych'}
                {' · '}{plForm(view.blocks.length, 'sekcja', 'sekcje', 'sekcji')}
              </p>
            </div>
          ))}
          {definition.views.length === 0 && (
            <p className="text-sm text-muted-foreground">Brak zdefiniowanych widoków.</p>
          )}
        </div>
      </PreviewSection>
    </div>
  )
}

function PreviewSection({
  Icon,
  eyebrow,
  title,
  children,
}: {
  Icon: typeof Calculator
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-3xl bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-accent">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
          <h2 className="mt-1 font-heading text-lg font-bold">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}
