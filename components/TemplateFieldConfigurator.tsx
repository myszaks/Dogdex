'use client'
import type { FormField } from '@/types'
import { formatDateShort } from '@/lib/utils'
import OptionReorder from './OptionReorder'

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
  const options = field.options ?? []

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
        <OptionReorder options={options} onChange={onChange} type={field.type} />
      </div>
    </div>
  )
}
