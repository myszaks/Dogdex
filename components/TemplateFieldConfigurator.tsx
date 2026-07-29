'use client'
import type { FormField } from '@/types'
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
          <p className="mb-2 text-xs font-medium text-[#71806a]">Pytania gotowe bez dodatkowych ustawień:</p>
          <div className="flex flex-wrap gap-1.5">
            {fixed.map(f => (
              <span
                key={f.id}
                className={`rounded-full border px-3 py-1.5 text-xs ${f.required ? 'border-[#f2a37d] bg-[#fff3eb] text-[#9b4b26]' : 'border-[#d6e2d0] bg-white text-[#53614d]'}`}
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
          <p className="text-sm font-semibold text-[#43513d]">Sprawdź opcje i terminy</p>
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
    <div className="rounded-2xl border border-[#dfe8d8] bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
            field.required ? 'border-[#f2a37d] bg-[#fff3eb] text-[#9b4b26]' : 'border-[#d6e2d0] bg-[#f4f7f1] text-[#53614d]'
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

      <div className="space-y-1 rounded-xl bg-[#f8faf6] p-3">
        <OptionReorder options={options} onChange={onChange} type={field.type} />
      </div>
    </div>
  )
}
