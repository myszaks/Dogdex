'use client'
import { useState } from 'react'
import type { FormField } from '@/types'
import { formatDateShort } from '@/lib/utils'

interface Props {
  fields: FormField[]
  onChange: (fields: FormField[]) => void
}

const CONFIGURABLE_TYPES: FormField['type'][] = ['select', 'multiselect', 'multidate']

export default function TemplateFieldConfigurator({ fields, onChange }: Props) {
  const configurable = fields.filter(f => CONFIGURABLE_TYPES.includes(f.type))
  const fixed = fields.filter(f => !CONFIGURABLE_TYPES.includes(f.type))

  function updateFieldOptions(fieldId: string, options: string[]) {
    onChange(fields.map(f => f.id === fieldId ? { ...f, options } : f))
  }

  if (fields.length === 0) return null

  return (
    <div className="space-y-3">
      {fixed.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-1.5">Pola tekstowe (bez dodatkowej konfiguracji):</p>
          <div className="flex flex-wrap gap-1.5">
            {fixed.map(f => (
              <span
                key={f.id}
                className={`text-xs rounded-full px-3 py-1 ${f.required ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}
              >
                {f.required && <span className="mr-1 font-bold">*</span>}
                {f.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {configurable.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">Uzupełnij opcje/daty dla pól:</p>
          {configurable.map(field => (
            <FieldOptionsEditor
              key={field.id}
              field={field}
              onChange={opts => updateFieldOptions(field.id, opts)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FieldOptionsEditor({
  field,
  onChange,
}: {
  field: FormField
  onChange: (opts: string[]) => void
}) {
  const [addingDate, setAddingDate] = useState(false)
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10))

  const options = field.options ?? []

  function removeOption(i: number) {
    onChange(options.filter((_, idx) => idx !== i))
  }

  function updateOption(i: number, val: string) {
    const next = [...options]
    next[i] = val
    onChange(next)
  }

  function addTextOption() {
    onChange([...options, ''])
  }

  function addDateOption() {
    if (newDate && !options.includes(newDate)) {
      onChange([...options, newDate])
    }
    setNewDate(new Date().toISOString().slice(0, 10))
    setAddingDate(false)
  }

  const typeLabel =
    field.type === 'multidate'
      ? '📅 Daty do wyboru'
      : field.type === 'multiselect'
      ? '☑️ Wielokrotny wybór'
      : '▾ Lista wyboru'

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${
            field.required ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {field.required && '* '}
          {field.label}
        </span>
        <span className="text-xs text-slate-400">{typeLabel}</span>
      </div>

      {field.description && (
        <p className="text-xs text-slate-400 mb-2">{field.description}</p>
      )}

      <div className="space-y-1 pl-1 border-l-2 border-sky-200">
        {options.length === 0 && (
          <p className="text-xs text-slate-400 italic py-0.5">Brak opcji — dodaj poniżej</p>
        )}

        {options.map((opt, i) =>
          field.type === 'multidate' ? (
            <div key={i} className="flex items-center gap-1">
              <span className="text-sm text-slate-700 flex-1 py-1 px-2 bg-slate-50 rounded">
                {(() => {
                  try {
                    return formatDateShort(opt)
                  } catch {
                    return opt
                  }
                })()}
              </span>
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="text-red-400 hover:text-red-600 px-2 text-sm"
                title="Usuń"
              >
                ✕
              </button>
            </div>
          ) : (
            <div key={i} className="flex gap-1">
              <input
                className="form-input flex-1 text-sm py-1"
                value={opt}
                onChange={e => updateOption(i, e.target.value)}
                placeholder="Opcja..."
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="text-red-400 hover:text-red-600 px-2 text-sm"
                title="Usuń"
              >
                ✕
              </button>
            </div>
          )
        )}

        {field.type === 'multidate' ? (
          <div className="flex gap-2 items-center pt-0.5">
            {addingDate ? (
              <>
                <input
                  type="date"
                  className="form-input text-sm flex-1"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                />
                <button
                  type="button"
                  onClick={addDateOption}
                  className="btn btn-primary text-xs px-3 py-1"
                >
                  Dodaj
                </button>
                <button
                  type="button"
                  onClick={() => setAddingDate(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Anuluj
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAddingDate(true)}
                className="text-xs text-sky-600 hover:text-sky-800 font-medium"
              >
                + Dodaj datę
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={addTextOption}
            className="text-xs text-sky-600 hover:text-sky-800 font-medium pt-0.5"
          >
            + Dodaj opcję
          </button>
        )}
      </div>
    </div>
  )
}
