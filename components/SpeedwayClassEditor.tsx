'use client'

import { useState } from 'react'
import { Plus, Ruler, Trash2 } from 'lucide-react'
import type {
  CompetitionFormatDefinition,
  CompetitionGroupDefinition,
} from '@/types/competition'

interface Props {
  definition: CompetitionFormatDefinition
  onChange: (definition: CompetitionFormatDefinition) => void
}

type HeightBucket = NonNullable<CompetitionGroupDefinition['buckets']>[number]

export function findSpeedwayHeightGroup(
  definition: CompetitionFormatDefinition,
): CompetitionGroupDefinition | null {
  return definition.groups.find(group =>
    group.source.op === 'ref'
    && group.source.path === 'registration.dog_height_cm'
    && Boolean(group.buckets?.length)
  ) ?? null
}

function nextClassKey(buckets: HeightBucket[]) {
  const existing = new Set(buckets.map(bucket => bucket.key))
  let index = buckets.length + 1
  while (existing.has(`class_${index}`)) index += 1
  return `class_${index}`
}

function withContinuousRanges(buckets: HeightBucket[]): HeightBucket[] {
  return buckets.map((bucket, index) => ({
    ...bucket,
    min: index === 0 ? undefined : bucket.min,
    max: buckets[index + 1]?.min,
  }))
}

function rangeDescription(bucket: HeightBucket) {
  if (bucket.min === undefined && bucket.max !== undefined) return `poniżej ${bucket.max} cm`
  if (bucket.min !== undefined && bucket.max === undefined) return `od ${bucket.min} cm`
  if (bucket.min !== undefined && bucket.max !== undefined) {
    return `od ${bucket.min} do poniżej ${bucket.max} cm`
  }
  return 'bez ograniczenia wzrostu'
}

export default function SpeedwayClassEditor({ definition, onChange }: Props) {
  const group = findSpeedwayHeightGroup(definition)
  if (!group?.buckets) return null
  const buckets = group.buckets
  const groupId = group.id
  const canAddClass = (buckets.at(-1)?.min ?? 0) < 199.9

  function updateBuckets(nextBuckets: HeightBucket[]) {
    onChange({
      ...definition,
      groups: definition.groups.map(candidate =>
        candidate.id === groupId
          ? { ...candidate, values: undefined, buckets: withContinuousRanges(nextBuckets) }
          : candidate
      ),
    })
  }

  function updateBoundary(index: number, min: number) {
    updateBuckets(buckets.map((bucket, bucketIndex) =>
      bucketIndex === index ? { ...bucket, min } : bucket
    ))
  }

  function updateOverrideLabel(key: string, label: string) {
    onChange({
      ...definition,
      groups: definition.groups.map(candidate =>
        candidate.id === groupId
          ? {
              ...candidate,
              overrides: candidate.overrides?.map(override =>
                override.key === key ? { ...override, label } : override
              ),
            }
          : candidate
      ),
    })
  }

  function addClass() {
    const last = buckets.at(-1)
    const newMin = Math.min(200, Math.max(1, (last?.min ?? 0) + 10))
    updateBuckets([
      ...buckets,
      {
        key: nextClassKey(buckets),
        label: 'Nowa klasa',
        min: newMin,
      },
    ])
  }

  function removeClass(index: number) {
    if (buckets.length <= 2) return
    updateBuckets(buckets.filter((_, bucketIndex) => bucketIndex !== index))
  }

  return (
    <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50/50 p-4 sm:p-5">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-accent shadow-sm">
          <Ruler className="h-5 w-5" />
        </span>
        <div>
          <p className="font-bold text-primary">Klasy wzrostowe Speedway</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Wpisz dolną granicę każdej kolejnej klasy. Górna granica poprzedniej
            ustawi się automatycznie, więc nie powstaną luki ani nakładające się przedziały.
          </p>
        </div>
      </div>

      {group.overrides && group.overrides.length > 0 && (
        <div className="mt-4 rounded-xl border border-orange-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">
            Klasy specjalne
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Zaznaczona przez uczestnika klasa Sport ma pierwszeństwo. Następnie
            sprawdzana jest klasa chartów, a dopiero później przedział wzrostowy.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {group.overrides.map(override => (
              <div key={override.key}>
                <label htmlFor={`speedway-override-${override.key}`} className="form-label text-xs">
                  {override.key === 'sport' ? 'Nazwa klasy sportowej' : 'Nazwa klasy chartów'}
                </label>
                <input
                  id={`speedway-override-${override.key}`}
                  className="form-input min-h-11"
                  value={override.label}
                  onChange={event => updateOverrideLabel(override.key, event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {buckets.map((bucket, index) => (
          <div
            key={bucket.key}
            className="grid items-center gap-3 rounded-xl border border-orange-100 bg-white p-3 sm:grid-cols-[minmax(150px,1fr)_150px_minmax(160px,1fr)_44px]"
          >
            <div>
              <label htmlFor={`speedway-class-${bucket.key}-label`} className="form-label text-xs">Nazwa klasy</label>
              <input
                id={`speedway-class-${bucket.key}-label`}
                className="form-input min-h-11"
                value={bucket.label}
                onChange={event => updateBuckets(buckets.map((candidate, bucketIndex) =>
                  bucketIndex === index
                    ? { ...candidate, label: event.target.value }
                    : candidate
                ))}
              />
            </div>

            {index === 0 ? (
              <div>
                <span className="form-label text-xs">Początek klasy</span>
                <div className="flex min-h-11 items-center rounded-xl bg-sage-50 px-3 text-sm font-semibold text-sage-600">
                  Od 0 cm
                </div>
              </div>
            ) : (
              <BoundaryInput
                key={`${bucket.key}-${bucket.min}`}
                id={`speedway-class-${bucket.key}-minimum`}
                value={bucket.min ?? 0}
                min={(buckets[index - 1]?.min ?? 0) + 0.1}
                max={(buckets[index + 1]?.min ?? 200) - 0.1}
                onCommit={value => updateBoundary(index, value)}
              />
            )}

            <div>
              <span className="form-label text-xs">Przedział</span>
              <div className="flex min-h-11 items-center rounded-xl bg-sage-50 px-3 text-sm text-sage-700">
                {rangeDescription(bucket)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => removeClass(index)}
              disabled={buckets.length <= 2}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-sage-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-25"
              aria-label={`Usuń klasę ${bucket.label}`}
              title="Usuń klasę"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addClass}
        disabled={!canAddClass}
        className="btn btn-secondary btn-sm mt-3 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Dodaj klasę wzrostową
      </button>
    </div>
  )
}

function BoundaryInput({
  id,
  value,
  min,
  max,
  onCommit,
}: {
  id: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  function commit() {
    const parsed = Number(draft.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setDraft(String(value))
      return
    }
    onCommit(parsed)
  }

  return (
    <div>
      <label htmlFor={id} className="form-label text-xs">Od wzrostu</label>
      <div className="relative">
        <input
          id={id}
          className="form-input min-h-11 pr-10"
          type="number"
          min={min}
          max={max}
          step="0.1"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-sage-500">
          cm
        </span>
      </div>
    </div>
  )
}
