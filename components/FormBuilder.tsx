'use client'
import { useState, useEffect } from 'react'
import type { FormField } from '@/types'
import OptionReorder from './OptionReorder'

// ─── Field type labels ──────────────────────────────────────────────────────
const FIELD_TYPES: Array<{ value: FormField['type']; label: string }> = [
  { value: 'text', label: 'Tekst' },
  { value: 'number', label: 'Liczba' },
  { value: 'email', label: 'E-mail' },
  { value: 'select', label: 'Lista wyboru' },
  { value: 'multiselect', label: 'Wielokrotny wybór' },
  { value: 'multidate', label: 'Wybór dat (wielokrotny)' },
  { value: 'textarea', label: 'Długi tekst' },
  { value: 'checkbox', label: 'Checkbox (tak/nie)' },
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
  function addOption() {
    const newOpt = field.type === 'multidate'
      ? new Date().toISOString().slice(0, 10)
      : 'Nowa opcja'
    onUpdate(index, { options: [...(field.options ?? []), newOpt] })
  }

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm">
      <div className="flex gap-2 items-start">
        {/* Move buttons */}
        <div className="flex flex-col gap-1 pt-1 shrink-0">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={isFirst}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-20 leading-none text-xs px-1"
            title="Przesuń w górę"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={isLast}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-20 leading-none text-xs px-1"
            title="Przesuń w dół"
          >
            ▼
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-2 min-w-0">
          {/* Label + type row */}
          <div className="flex gap-2">
            <input
              className="form-input flex-1 text-sm"
              value={field.label}
              onChange={e => onUpdate(index, { label: e.target.value })}
              placeholder="Nazwa pola"
            />
            <select
              className="form-input text-sm w-36 shrink-0"
              value={field.type}
              onChange={e => {
                const t = e.target.value as FormField['type']
                onUpdate(index, {
                  type: t,
                  options:
                    (t === 'select' || t === 'multiselect' || t === 'multidate')
                      ? field.options?.length
                        ? field.options
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

          {/* Placeholder */}
          {field.type !== 'checkbox' && field.type !== 'select' && (
            <input
              className="form-input text-sm"
              value={field.placeholder ?? ''}
              onChange={e => onUpdate(index, { placeholder: e.target.value })}
              placeholder="Tekst podpowiedzi (opcjonalnie)"
            />
          )}

          {/* Description */}
          <input
            className="form-input text-sm"
            value={field.description ?? ''}
            onChange={e =>
              onUpdate(index, { description: e.target.value || undefined })
            }
            placeholder="Opis / pomoc dla uczestnika (opcjonalnie)"
          />

          {/* Select options */}
          {(field.type === 'select' || field.type === 'multiselect' || field.type === 'multidate') && (
            templateMode ? (
              <p className="text-xs text-slate-400 italic pl-1 border-l-2 border-slate-200 py-1">
                Opcje uzupełniane przy tworzeniu/edycji wydarzenia
              </p>
            ) : (
            <div className="space-y-1 pl-1 border-l-2 border-sky-200">
              <p className="text-xs font-medium text-slate-500">Opcje listy:</p>
                  <OptionReorder
                    options={field.options ?? []}
                    onChange={next => onUpdate(index, { options: next })}
                    type={field.type}
                  />
            </div>
            )
          )}

          {/* Required toggle */}
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={field.required}
              onChange={e => onUpdate(index, { required: e.target.checked })}
              className="rounded"
            />
            Pole wymagane
          </label>
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded p-1 shrink-0"
          title="Usuń pole"
        >
          🗑️
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
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
            <input
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
          {error && <p className="text-xs text-red-600">{error}</p>}
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
            <p className="text-xs text-slate-400">{t.fields.length} pól dodatkowych</p>
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

  function addField(type: FormField['type']) {
    const needsOptions = type === 'select' || type === 'multiselect' || type === 'multidate'
    const newField: FormField = {
      id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: DEFAULT_LABELS[type],
      type,
      required: false,
      options: !templateMode && needsOptions ? ['Opcja 1', 'Opcja 2'] : undefined,
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
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Pola stałe (zawsze wymagane)
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
              className="text-xs bg-slate-200 text-slate-600 rounded-full px-3 py-1"
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Custom fields */}
      {value.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Pola dodatkowe
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
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Dodaj pole
        </p>
        <div className="flex flex-wrap gap-2">
          {FIELD_TYPES.map(({ value: type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => addField(type)}
              className="text-xs btn btn-secondary py-1 px-3"
            >
              + {label}
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
