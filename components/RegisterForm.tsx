'use client'
import { useState } from 'react'
import { formatDateShort } from '@/lib/utils'
import type { FormField } from '@/types'

interface Props {
  eventId: string
  formFields?: FormField[]
  onSuccess?: () => void
}

interface BaseValues {
  ownerName: string
  ownerEmail: string
  dogName: string
  dogBreed: string
}

const BASE_INITIAL: BaseValues = {
  ownerName: '',
  ownerEmail: '',
  dogName: '',
  dogBreed: '',
}


export default function RegisterForm({ eventId, formFields = [], onSuccess }: Props) {
  const [base, setBase] = useState<BaseValues>(BASE_INITIAL)
  const [dynamic, setDynamic] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function handleBase(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.name
    setBase(prev => ({ ...prev, [name]: e.target.value }))
    if (fieldErrors[name]) setFieldErrors(prev => ({ ...prev, [name]: '' }))
  }

  function handleDynamic(id: string, value: string) {
    setDynamic(prev => ({ ...prev, [id]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate required dynamic fields
    for (const field of formFields) {
      if (field.required) {
        const val = dynamic[field.id]
        const isEmpty = (field.type === 'multiselect' || field.type === 'multidate')
          ? !val || val.split(',').filter(Boolean).length === 0
          : !val?.trim()
        if (isEmpty) {
          setError(`Pole „${field.label}" jest wymagane.`)
          setLoading(false)
          return
        }
      }
    }

    try {
      setFieldErrors({})
      const processedExtra: Record<string, any> = {}
      for (const [k, v] of Object.entries(dynamic)) {
        const f = formFields.find(ff => ff.id === k)
        if (f && (f.type === 'multiselect' || f.type === 'multidate')) {
          processedExtra[k] = typeof v === 'string' ? v.split(',').filter(Boolean) : v
        } else {
          processedExtra[k] = v
        }
      }

      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId,
          ownerName: base.ownerName,
          ownerEmail: base.ownerEmail,
          dogName: base.dogName,
          dogBreed: base.dogBreed,
          extraFields: processedExtra,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        // Duplicate entry for same email + dog name
        if (res.status === 409 && typeof json.error === 'string' && json.error.includes('Istnieje już zapis')) {
          setFieldErrors({ ownerEmail: json.error, dogName: json.error })
          setLoading(false)
          return
        }
        throw new Error(json.error ?? 'Błąd serwera')
      }

      setSuccess(true)
      onSuccess?.()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="card text-center py-14">
        <p className="text-5xl mb-4">🎉</p>
        <p className="text-xl font-semibold text-green-700">Zapis przesłany!</p>
        <p className="text-slate-500 mt-2 text-sm max-w-xs mx-auto">
          Organizator potwierdzi Twój zapis. Sprawdzaj e-mail po potwierdzenie.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      {/* ── Base fields ── */}
      <div>
        <label className="form-label">Imię i nazwisko właściciela *</label>
        <input
          className="form-input"
          name="ownerName"
          value={base.ownerName}
          onChange={handleBase}
          required
          placeholder="Jan Kowalski"
          autoComplete="name"
        />
      </div>

      <div>
        <label className="form-label">Adres e-mail *</label>
        <input
          className="form-input"
          type="email"
          name="ownerEmail"
          value={base.ownerEmail}
          onChange={handleBase}
          required
          placeholder="jan@example.com"
          autoComplete="email"
        />
        {fieldErrors.ownerEmail && (
          <p className="text-xs text-red-600 mt-1">{fieldErrors.ownerEmail}</p>
        )}
      </div>

      <div>
        <label className="form-label">Imię psa *</label>
        <input
          className="form-input"
          name="dogName"
          value={base.dogName}
          onChange={handleBase}
          required
          placeholder="Burek"
        />
        {fieldErrors.dogName && (
          <p className="text-xs text-red-600 mt-1">{fieldErrors.dogName}</p>
        )}
      </div>

      <div>
        <label className="form-label">Rasa psa</label>
        <input
          className="form-input"
          name="dogBreed"
          value={base.dogBreed}
          onChange={handleBase}
          placeholder="Border Collie"
        />
      </div>

      {/* ── Dynamic fields ── */}
      {formFields.map(field => (
        <DynamicField
          key={field.id}
          field={field}
          value={dynamic[field.id] ?? ''}
          onChange={val => handleDynamic(field.id, val)}
        />
      ))}

      {error && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
          ⚠️ {error}
        </div>
      )}

      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading ? 'Wysyłanie...' : '✓ Wyślij zapis'}
      </button>

      <p className="text-xs text-slate-400 text-center">
        Dane osobowe przetwarzane są wyłącznie w celu organizacji wydarzenia.
      </p>
    </form>
  )
}

// ─── DynamicField ─────────────────────────────────────────────────────────
function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FormField
  value: string
  onChange: (val: string) => void
}) {
  const label = (
    <label className="form-label">
      {field.label}
      {field.required && ' *'}
    </label>
  )

  const hint = field.description ? (
    <p className="text-xs text-slate-400 mt-0.5">{field.description}</p>
  ) : null

  switch (field.type) {
    case 'multidate':
      {
        const selected = value.split(',').filter(Boolean)
        return (
          <div>
            {label}
            {field.description && <p className="text-xs text-slate-400 mt-0.5 mb-2">{field.description}</p>}
            <div className="space-y-1.5 mt-1">
              {field.options?.map(opt => {
                const dateLabel = (() => {
                  try {
                    return formatDateShort(opt)
                  } catch {
                    return opt
                  }
                })()
                const checked = selected.includes(opt)
                return (
                  <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={checked}
                      onChange={e => {
                        const next = checked
                          ? selected.filter(v => v !== opt)
                          : [...selected, opt]
                        onChange(next.join(','))
                      }}
                    />
                    {dateLabel}
                  </label>
                )
              })}
            </div>
            {field.required && !value && (
              <p className="text-xs text-orange-500 mt-1">Wybierz co najmniej jedną opcję</p>
            )}
          </div>
        )
      }

    case 'multiselect':
      return (
        <div>
          {label}
          {field.description && <p className="text-xs text-slate-400 mt-0.5 mb-2">{field.description}</p>}
          <div className="space-y-1.5 mt-1">
            {field.options?.map(opt => {
              const selected = value.split(',').filter(Boolean)
              const checked = selected.includes(opt)
              return (
                <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={checked}
                    onChange={e => {
                      const next = checked
                        ? selected.filter(v => v !== opt)
                        : [...selected, opt]
                      onChange(next.join(','))
                    }}
                  />
                  {opt}
                </label>
              )
            })}
          </div>
          {field.required && !value && (
            <p className="text-xs text-orange-500 mt-1">Wybierz co najmniej jedną opcję</p>
          )}
        </div>
      )

    case 'select':
      return (
        <div>
          {label}
          <select
            className="form-input"
            value={value}
            onChange={e => onChange(e.target.value)}
            required={field.required}
          >
            <option value="">— wybierz —</option>
            {field.options?.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {hint}
        </div>
      )

    case 'textarea':
      return (
        <div>
          {label}
          <textarea
            className="form-input"
            rows={3}
            value={value}
            onChange={e => onChange(e.target.value)}
            required={field.required}
            placeholder={field.placeholder}
          />
          {hint}
        </div>
      )

    case 'checkbox':
      return (
        <div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={value === 'true'}
              onChange={e => onChange(e.target.checked ? 'true' : '')}
              required={field.required}
              className="rounded"
            />
            {field.label}
            {field.required && ' *'}
          </label>
          {hint}
        </div>
      )

    default:
      return (
        <div>
          {label}
          <input
            className="form-input"
            type={field.type}
            value={value}
            onChange={e => onChange(e.target.value)}
            required={field.required}
            placeholder={field.placeholder}
          />
          {hint}
        </div>
      )
  }
}
