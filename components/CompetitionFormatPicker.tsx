'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calculator, ExternalLink } from 'lucide-react'
import type {
  CompetitionFormatDefinition,
  CompetitionScalar,
} from '@/types/competition'

interface FormatSummary {
  id: string
  name: string
  version: number
  status: 'draft' | 'published' | 'archived'
  is_system: boolean
  definition: CompetitionFormatDefinition
}

interface Props {
  selectedId: string | null
  values: Record<string, CompetitionScalar>
  onSelect: (id: string | null, definition: CompetitionFormatDefinition | null) => void
  onValuesChange: (values: Record<string, CompetitionScalar>) => void
  showEventFields?: boolean
}

export default function CompetitionFormatPicker({
  selectedId,
  values,
  onSelect,
  onValuesChange,
  showEventFields = true,
}: Props) {
  const [formats, setFormats] = useState<FormatSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/competition-formats')
      .then(async response => {
        const json = await response.json()
        if (!response.ok) throw new Error(json.error ?? 'Nie udało się pobrać formatów.')
        setFormats(Array.isArray(json) ? json : [])
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Nie udało się pobrać formatów.'))
      .finally(() => setLoading(false))
  }, [])

  const selected = formats.find(format => format.id === selectedId) ?? null

  function selectFormat(id: string) {
    const format = formats.find(candidate => candidate.id === id) ?? null
    onSelect(format?.id ?? null, format?.definition ?? null)
    const allowedIds = new Set(format?.definition.eventFields.map(field => field.id) ?? [])
    onValuesChange(Object.fromEntries(
      Object.entries(values).filter(([key]) => allowedIds.has(key))
    ))
  }

  function updateValue(fieldId: string, value: CompetitionScalar) {
    onValuesChange({ ...values, [fieldId]: value })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">Twoje zapisane schematy</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Widzisz tylko własne schematy oraz gotowe schematy Dogdex.
          </p>
        </div>
        <Link
          href="/organizer/formats"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent hover:underline"
        >
          Zarządzaj
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="h-12 animate-pulse rounded-xl bg-sage-100" />
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : (
        <select
          className="form-input"
          value={selectedId ?? ''}
          onChange={event => selectFormat(event.target.value)}
        >
          <option value="">Nie używaj zapisanego schematu</option>
          {formats.map(format => (
            <option key={format.id} value={format.id}>
              {format.name} · v{format.version}
              {format.status === 'draft' ? ' · szkic' : ''}
              {format.is_system ? ' · Dogdex' : ''}
            </option>
          ))}
        </select>
      )}

      {formats.length === 0 && !loading && !error && (
        <div className="rounded-xl border border-dashed border-sage-300 bg-sage-50 p-4 text-sm text-sage-700">
          <Calculator className="mb-2 h-5 w-5 text-accent" />
          Nie masz jeszcze własnego schematu. Możesz zacząć od gotowej propozycji poniżej
          i zapisać ją bez opuszczania kreatora wydarzenia.
        </div>
      )}

      {showEventFields && selected && selected.definition.eventFields.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-sage-200 bg-sage-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sage-500">
            Parametry tego wydarzenia
          </p>
          {selected.definition.eventFields.map(field => (
            <label key={field.id} className="block">
              <span className="form-label">
                {field.label}
                {field.required ? ' *' : ''}
              </span>
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
                    step={field.type === 'duration_ms' ? 1 : field.precision ? 10 ** -field.precision : 'any'}
                    value={values[field.id] === null || values[field.id] === undefined ? '' : String(values[field.id])}
                    onChange={event => {
                      if (field.type === 'text') updateValue(field.id, event.target.value)
                      else updateValue(field.id, event.target.value === '' ? null : Number(event.target.value))
                    }}
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
      )}
    </div>
  )
}
