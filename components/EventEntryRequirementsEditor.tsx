'use client'

import { FileCheck2, ShieldCheck } from 'lucide-react'
import {
  DOG_DOCUMENT_TYPE_LABELS,
  normalizeEventEntryRequirements,
  type EventDocumentRequirement,
  type EventEntryRequirements,
} from '@/lib/dogDocuments'

const REQUIREMENT_DOCUMENT_TYPES: EventDocumentRequirement['type'][] = [
  'rabies_vaccination',
  'pedigree',
  'sport_license',
  'qualification',
  'health_certificate',
  'insurance',
]

export default function EventEntryRequirementsEditor({
  value,
  onChange,
  idPrefix = 'event-entry',
}: {
  value: EventEntryRequirements
  onChange: (value: EventEntryRequirements) => void
  idPrefix?: string
}) {
  const normalized = normalizeEventEntryRequirements(value)

  function patch(next: Partial<EventEntryRequirements>) {
    onChange({ ...normalized, ...next })
  }

  function numberValue(key: 'minAgeMonths' | 'maxAgeMonths' | 'minHeightCm' | 'maxHeightCm', raw: string) {
    patch({ [key]: raw === '' ? null : Number(raw) })
  }

  function toggleGender(gender: 'male' | 'female') {
    patch({
      allowedGenders: normalized.allowedGenders.includes(gender)
        ? normalized.allowedGenders.filter(item => item !== gender)
        : [...normalized.allowedGenders, gender],
    })
  }

  function toggleDocument(type: EventDocumentRequirement['type']) {
    const existing = normalized.documents.find(document => document.type === type)
    patch({
      documents: existing
        ? normalized.documents.filter(document => document.type !== type)
        : [...normalized.documents, { type, mustBeValidOnEventDate: true }],
    })
  }

  function toggleValidity(type: EventDocumentRequirement['type']) {
    patch({
      documents: normalized.documents.map(document => document.type === type
        ? { ...document, mustBeValidOnEventDate: !document.mustBeValidOnEventDate }
        : document),
    })
  }

  return (
    <div className="rounded-3xl border border-sage-200 bg-sage-50/40 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h3 className="font-heading text-lg font-semibold">Warunki dopuszczenia psa</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">System sprawdzi profil i dokumenty psa przed przyjęciem zapisu. Puste pola nie ograniczają udziału.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField id={`${idPrefix}-min-age`} label="Minimalny wiek" suffix="mies." value={normalized.minAgeMonths} min={0} max={360} onChange={raw => numberValue('minAgeMonths', raw)} />
        <NumberField id={`${idPrefix}-max-age`} label="Maksymalny wiek" suffix="mies." value={normalized.maxAgeMonths} min={0} max={360} onChange={raw => numberValue('maxAgeMonths', raw)} />
        <NumberField id={`${idPrefix}-min-height`} label="Minimalny wzrost" suffix="cm" value={normalized.minHeightCm} min={1} max={200} step="0.5" onChange={raw => numberValue('minHeightCm', raw)} />
        <NumberField id={`${idPrefix}-max-height`} label="Maksymalny wzrost" suffix="cm" value={normalized.maxHeightCm} min={1} max={200} step="0.5" onChange={raw => numberValue('maxHeightCm', raw)} />
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Dopuszczalna płeć</legend>
        <p className="mt-1 text-xs text-muted-foreground">Brak zaznaczenia oznacza wszystkie psy.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {([['male', 'Pies'], ['female', 'Suka']] as const).map(([gender, label]) => (
            <label key={gender} htmlFor={`${idPrefix}-gender-${gender}`} className="flex cursor-pointer items-center gap-2 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium">
              <input id={`${idPrefix}-gender-${gender}`} type="checkbox" checked={normalized.allowedGenders.includes(gender)} onChange={() => toggleGender(gender)} className="h-4 w-4 accent-primary" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="flex items-center gap-2 text-sm font-semibold"><FileCheck2 className="h-4 w-4 text-accent" />Wymagane dokumenty</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {REQUIREMENT_DOCUMENT_TYPES.map(type => {
            const selected = normalized.documents.find(document => document.type === type)
            return (
              <div key={type} className="rounded-2xl border border-border bg-white p-4">
                <label htmlFor={`${idPrefix}-document-${type}`} className="flex cursor-pointer items-start gap-3">
                  <input id={`${idPrefix}-document-${type}`} type="checkbox" checked={Boolean(selected)} onChange={() => toggleDocument(type)} className="mt-0.5 h-4 w-4 accent-primary" />
                  <span className="text-sm font-semibold">{DOG_DOCUMENT_TYPE_LABELS[type]}</span>
                </label>
                {selected && (
                  <label htmlFor={`${idPrefix}-document-valid-${type}`} className="mt-3 flex cursor-pointer items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                    <input id={`${idPrefix}-document-valid-${type}`} type="checkbox" checked={selected.mustBeValidOnEventDate} onChange={() => toggleValidity(type)} className="mt-0.5 accent-primary" />
                    Dokument musi być ważny do końca wydarzenia
                  </label>
                )}
              </div>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}

function NumberField({ id, label, suffix, value, min, max, step = '1', onChange }: { id: string; label: string; suffix: string; value: number | null; min: number; max: number; step?: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="form-label">{label}</label>
      <div className="relative">
        <input id={id} className="form-input pr-14" type="number" min={min} max={max} step={step} value={value ?? ''} onChange={event => onChange(event.target.value)} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  )
}
