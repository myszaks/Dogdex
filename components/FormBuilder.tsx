'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import type { FormField } from '@/types'
import OptionReorder from './OptionReorder'
import { formatPolishCount, POLISH_FORMS } from '@/lib/polish'

// ─── Field type labels ──────────────────────────────────────────────────────
const FIELD_TYPES: Array<{ value: FormField['type']; label: string }> = [
  { value: 'text', label: 'Tekst' },
  { value: 'number', label: 'Liczba' },
  { value: 'email', label: 'E-mail' },
  { value: 'select', label: 'Lista wyboru' },
  { value: 'multiselect', label: 'Wielokrotny wybór' },
  { value: 'multidate', label: 'Wybór dat (wielokrotny)' },
  { value: 'textarea', label: 'Długi tekst' },
  { value: 'checkbox', label: 'Pole wyboru (tak/nie)' },
]

const DEFAULT_LABELS: Record<FormField['type'], string> = {
  text: 'Pole tekstowe',
  number: 'Pole liczbowe',
  email: 'Adres e-mail',
  select: 'Lista wyboru',
  multiselect: 'Wielokrotny wybór',
  multidate: 'Wybór dat',
  textarea: 'Długi tekst',
  checkbox: 'Pole wyboru',
}

// ─── FieldCard ──────────────────────────────────────────────────────────────
interface FieldCardProps {
  field: FormField
  index: number
  isFirst: boolean
  isLast: boolean
  onUpdate: (index: number, patch: Partial<FormField>) => void
  onRemove: (index: number) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
  templateMode?: boolean
}

function FieldCard({
  field,
  index,
  isFirst,
  isLast,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  templateMode,
}: FieldCardProps) {
  const fieldIdPart = (field.id || String(index)).replace(/[^a-zA-Z0-9_-]/g, '-')
  const labelId = `form-field-${fieldIdPart}-label`
  const typeId = `form-field-${fieldIdPart}-type`
  const placeholderId = `form-field-${fieldIdPart}-placeholder`
  const descriptionId = `form-field-${fieldIdPart}-description`
  const requiredId = `form-field-${fieldIdPart}-required`

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex gap-3 items-start">
        {/* Move buttons */}
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={isFirst}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#dfe8d8] text-[#66735f] hover:bg-[#f4f7f1] disabled:opacity-25"
            title="Przesuń w górę"
            aria-label="Przesuń pole w górę"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={isLast}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#dfe8d8] text-[#66735f] hover:bg-[#f4f7f1] disabled:opacity-25"
            title="Przesuń w dół"
            aria-label="Przesuń pole w dół"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-2 min-w-0">
          {/* Label + type row */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="block">
              <label htmlFor={labelId} className="form-label">Nazwa pytania</label>
              <input
                id={labelId}
                className="form-input min-h-11 text-sm"
                value={field.label}
                onChange={e => onUpdate(index, { label: e.target.value })}
                placeholder="Np. Poziom zaawansowania"
              />
            </div>
            <div className="block">
              <label htmlFor={typeId} className="form-label">Sposób odpowiedzi</label>
              <select
                id={typeId}
                className="form-input min-h-11 text-sm"
                value={field.type}
                onChange={e => {
                  const t = e.target.value as FormField['type']
                  onUpdate(index, {
                    type: t,
                    options:
                      (t === 'select' || t === 'multiselect' || t === 'multidate')
                        ? field.options?.length
                          ? field.options
                          : t === 'multidate'
                            ? []
                            : ['Opcja 1', 'Opcja 2']
                        : undefined,
                  })
                }}
              >
                {FIELD_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Placeholder */}
          {field.type !== 'checkbox' && field.type !== 'select' && (
            <div>
              <label htmlFor={placeholderId} className="form-label">Tekst podpowiedzi (opcjonalnie)</label>
              <input
                id={placeholderId}
                className="form-input min-h-11 text-sm"
                value={field.placeholder ?? ''}
                onChange={e => onUpdate(index, { placeholder: e.target.value })}
                placeholder="Np. Wpisz poziom zaawansowania"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label htmlFor={descriptionId} className="form-label">Opis dla uczestnika (opcjonalnie)</label>
            <input
              id={descriptionId}
              className="form-input min-h-11 text-sm"
              value={field.description ?? ''}
              onChange={e =>
                onUpdate(index, { description: e.target.value || undefined })
              }
              placeholder="Dodatkowe wyjaśnienie pytania"
            />
          </div>

          {/* Select options */}
          {(field.type === 'select' || field.type === 'multiselect' || field.type === 'multidate') && (
            <div className="space-y-2 rounded-xl border border-[#dfe8d8] bg-[#f8faf6] p-3">
              <p className="text-sm font-semibold text-[#43513d]">
                {field.type === 'multidate' ? 'Dostępne terminy' : 'Opcje odpowiedzi'}
              </p>
              {templateMode && (
                <p className="text-xs leading-relaxed text-[#71806a]">
                  Możesz wpisać domyślne opcje teraz. Przy konkretnym wydarzeniu da się je jeszcze zmienić.
                </p>
              )}
                  <OptionReorder
                    options={field.options ?? []}
                    onChange={next => onUpdate(index, { options: next })}
                    type={field.type}
                  />
            </div>
          )}

          {/* Required toggle */}
          <label htmlFor={requiredId} className="flex min-h-11 items-center gap-3 rounded-xl bg-[#f4f7f1] px-3 text-sm font-medium text-[#43513d] cursor-pointer select-none">
            <input
              id={requiredId}
              type="checkbox"
              checked={field.required}
              onChange={e => onUpdate(index, { required: e.target.checked })}
              className="h-5 w-5 rounded border-[#aebda7] text-[#f26a2e]"
            />
            Pole wymagane
          </label>
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#8a9684] hover:bg-red-50 hover:text-red-600"
          title="Usuń pole"
          aria-label="Usuń pole"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── SaveTemplatePanel ──────────────────────────────────────────────────────
function SaveTemplatePanel({
  fields,
  eventTypeId,
  onClose,
}: {
  fields: FormField[]
  eventTypeId: string | null
  onClose: () => void
}) {
  const nameId = `template-name-${useId().replace(/:/g, '')}`
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorId = `${nameId}-error`

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/form-templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), event_type_id: eventTypeId, fields }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Błąd serwera')
      }
      setSaved(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-green-200 rounded-lg p-3 bg-green-50 space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium text-green-800">💾 Zapisz jako szablon</p>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
          ✕
        </button>
      </div>
      {saved ? (
        <p className="text-sm text-green-700 font-medium">✓ Szablon zapisany!</p>
      ) : (
        <>
          <div className="flex gap-2">
            <label htmlFor={nameId} className="sr-only">Nazwa szablonu</label>
            <input
              id={nameId}
              className="form-input flex-1 text-sm"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nazwa szablonu, np. Agility A1–A3"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  save()
                }
              }}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            <button
              type="button"
              onClick={save}
              disabled={saving || !name.trim()}
              className="btn btn-primary text-sm py-1 px-4"
            >
              {saving ? '...' : 'Zapisz'}
            </button>
          </div>
          {error && <p id={errorId} role="alert" className="text-xs text-red-600">{error}</p>}
        </>
      )}
    </div>
  )
}

// ─── LoadTemplatePanel ──────────────────────────────────────────────────────
interface TemplateMeta {
  id: string
  name: string
  event_type_id: string | null
  fields: FormField[]
}

function LoadTemplatePanel({
  eventTypeId,
  onLoad,
  onClose,
}: {
  eventTypeId: string | null
  onLoad: (fields: FormField[]) => void
  onClose: () => void
}) {
  const [templates, setTemplates] = useState<TemplateMeta[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = eventTypeId ? `?event_type_id=${eventTypeId}` : ''
    fetch(`/api/form-templates${params}`)
      .then(r => r.json())
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [eventTypeId])

  return (
    <div className="border border-sky-200 rounded-lg p-3 bg-sky-50 space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium text-sky-800">📂 Załaduj szablon</p>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
          ✕
        </button>
      </div>
      {loading && <p className="text-sm text-slate-500">Ładowanie...</p>}
      {!loading && templates?.length === 0 && (
        <p className="text-sm text-slate-500">Brak zapisanych szablonów.</p>
      )}
      {templates?.map(t => (
        <div key={t.id} className="flex items-center justify-between gap-2 py-1 border-b border-sky-100 last:border-0">
          <div>
            <p className="text-sm font-medium text-slate-700">{t.name}</p>
            <p className="text-xs text-slate-400">
              {formatPolishCount(t.fields.length, POLISH_FORMS.field)} dodatkowych
            </p>
          </div>
          <button
            type="button"
            onClick={() => onLoad(t.fields.map(f => ({ ...f, id: `${f.id}_${Date.now()}` })))}
            className="btn btn-primary text-xs py-1 px-3 shrink-0"
          >
            Załaduj
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── FormBuilder (main export) ──────────────────────────────────────────────
interface Props {
  value: FormField[]
  onChange: (fields: FormField[]) => void
  eventTypeId?: string | null
  hideTemplateActions?: boolean
  templateMode?: boolean
}

export default function FormBuilder({ value, onChange, eventTypeId, hideTemplateActions, templateMode }: Props) {
  const [showSave, setShowSave] = useState(false)
  const [showLoad, setShowLoad] = useState(false)
  const idPrefix = useId().replace(/:/g, '')
  const nextFieldNumber = useRef(0)

  function addField(type: FormField['type']) {
    const needsOptions = type === 'select' || type === 'multiselect' || type === 'multidate'
    nextFieldNumber.current += 1
    const newField: FormField = {
      id: `field_${idPrefix}_${nextFieldNumber.current}`,
      label: DEFAULT_LABELS[type],
      type,
      required: false,
      options: needsOptions
        ? type === 'multidate'
          ? []
          : ['Opcja 1', 'Opcja 2']
        : undefined,
    }
    onChange([...value, newField])
  }

  function updateField(index: number, patch: Partial<FormField>) {
    const next = [...value]
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  function removeField(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function moveUp(index: number) {
    if (index === 0) return
    const next = [...value]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onChange(next)
  }

  function moveDown(index: number) {
    if (index === value.length - 1) return
    const next = [...value]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {/* Fixed base fields */}
      <div className="rounded-2xl border border-[#dfe8d8] bg-[#f4f7f1] p-4">
        <p className="text-sm font-semibold text-[#43513d] mb-1">
          Dane podstawowe są już dodane
        </p>
        <p className="mb-3 text-xs leading-relaxed text-[#71806a]">
          Nie musisz ponownie pytać o dane właściciela i psa.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            'Imię i nazwisko właściciela',
            'Adres e-mail',
            'Imię psa',
            'Rasa psa',
          ].map(f => (
            <span
              key={f}
              className="rounded-full border border-[#d6e2d0] bg-white px-3 py-1.5 text-xs text-[#53614d]"
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Custom fields */}
      {value.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[#43513d]">
            Twoje pytania dodatkowe
          </p>
          {value.map((field, i) => (
            <FieldCard
              key={field.id}
              field={field}
              index={i}
              isFirst={i === 0}
              isLast={i === value.length - 1}
              onUpdate={updateField}
              onRemove={removeField}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              templateMode={templateMode}
            />
          ))}
        </div>
      )}

      {/* Add field buttons */}
      <div>
        <p className="mb-1 text-sm font-semibold text-[#43513d]">
          Dodaj kolejne pytanie
        </p>
        <p className="mb-3 text-xs text-[#71806a]">
          Wybierz sposób, w jaki uczestnik ma odpowiedzieć.
        </p>
        <div className="flex flex-wrap gap-2">
          {FIELD_TYPES.map(({ value: type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => addField(type)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d6e2d0] bg-white px-3 py-2 text-xs font-semibold text-[#53614d] hover:border-[#f2a37d] hover:bg-[#fff7f2]"
            >
              <Plus className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Template actions */}
      {!hideTemplateActions && (
        <>
          <div className="flex gap-2 pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setShowLoad(!showLoad)
                setShowSave(false)
              }}
              className="btn btn-secondary text-sm flex-1"
            >
              📂 Załaduj szablon
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSave(!showSave)
                setShowLoad(false)
              }}
              disabled={value.length === 0}
              className="btn btn-secondary text-sm flex-1"
            >
              💾 Zapisz jako szablon
            </button>
          </div>

          {showLoad && (
            <LoadTemplatePanel
              eventTypeId={eventTypeId ?? null}
              onLoad={fields => {
                onChange(fields)
                setShowLoad(false)
              }}
              onClose={() => setShowLoad(false)}
            />
          )}

          {showSave && (
            <SaveTemplatePanel
              fields={value}
              eventTypeId={eventTypeId ?? null}
              onClose={() => setShowSave(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
