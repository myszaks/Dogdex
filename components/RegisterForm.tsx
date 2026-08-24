'use client'
import { useState, useEffect, useId, useRef } from 'react'
import { formatDateShort } from '@/lib/utils'
import type { FormField, Dog } from '@/types'
import useUser from '@/hooks/useUser'
import { getSupabaseBrowserClient } from '@/lib/supabaseClient'
import { getSizeClass, type SizeClass } from '@/lib/speedway'

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

// ─── Autofill helpers ─────────────────────────────────────────────────────────

function findSelectMatch(options: string[], value: string): string | null {
  const norm = value.toLowerCase().trim()
  return options.find(o => o.toLowerCase().trim() === norm) ?? null
}

function findAliasMatch(options: string[], aliases: string[]): string | null {
  for (const option of options) {
    if (aliases.includes(option.toLowerCase().trim())) return option
  }
  return null
}

const GENDER_ALIASES: Record<string, string[]> = {
  male:   ['male', 'samiec', 'pies', 'm'],
  female: ['female', 'samica', 'suka', 'f'],
}

const AGILITY_ALIASES: Record<string, string[]> = {
  none:         ['none', 'brak', '-', 'no'],
  beginner:     ['beginner', 'poczatkujacy', 'początkujący'],
  intermediate: ['intermediate', 'srednio', 'średnio', 'sredniozaawansowany', 'średniozaawansowany'],
  advanced:     ['advanced', 'zaawansowany'],
  competition:  ['competition', 'zawodnik', 'zawodowy'],
}

const SPEEDWAY_CLASS_OPTIONS = new Set(['xs', 's', 'm', 'l', 'chart', 'sport'])

function optionSizeClass(option: string): SizeClass | null {
  const match = option.trim().toUpperCase().match(/^(CHART|SPORT|XS|S|M|L)\b/)
  return match ? match[1] as SizeClass : null
}

function isSpeedwayClassField(opts: string[]): boolean {
  return opts.some(o => {
    const cls = optionSizeClass(o)
    return cls !== null || SPEEDWAY_CLASS_OPTIONS.has(o.toLowerCase().trim())
  })
}

function findSpeedwayClassMatch(options: string[], cls: SizeClass): string | null {
  return options.find(option => optionSizeClass(option) === cls) ?? findSelectMatch(options, cls)
}

function autofillFromDog(dog: Dog, fields: import('@/types').FormField[]): Record<string, string> {
  const filled: Record<string, string> = {}

  for (const field of fields) {
    const lbl = field.label.toLowerCase()
    const opts = field.options ?? []
    const isText = ['text', 'textarea'].includes(field.type)
    const isNum  = field.type === 'number'
    const isSel  = field.type === 'select'

    const tryFill = (raw: string | null) => {
      if (!raw) return
      if (isText || isNum) { filled[field.id] = raw; return }
      if (isSel)  { const m = findSelectMatch(opts, raw); if (m) filled[field.id] = m }
    }

    if (/ras[ay]|breed/i.test(lbl))                        tryFill(dog.breed)
    else if (/chip|pedigree|rodow[oó]d|mikrochip/i.test(lbl)) tryFill(dog.pedigree_or_chip)
    else if (/kolor|umaszczen|sier[śs]/i.test(lbl))        tryFill(dog.coat_color)
    else if (/wag[ai]|mas[ay]|weight/i.test(lbl))          tryFill(dog.weight_kg != null ? String(dog.weight_kg) : null)
    else if (/wzrost|wysoko[śs]|height/i.test(lbl))        tryFill(dog.height_cm != null ? String(dog.height_cm) : null)
    else if (/szczepien|wściekl|rabies|vaccin/i.test(lbl)) tryFill(dog.rabies_vaccine_expiry)
    else if (/p[łl]e[ćc]|gender|sex/i.test(lbl)) {
      if (!dog.gender) continue
      if (isSel) {
        const m = findAliasMatch(opts, GENDER_ALIASES[dog.gender] ?? [])
        if (m) filled[field.id] = m
      } else if (isText) filled[field.id] = dog.gender
    }
    else if (/agility|poziom|klasa/i.test(lbl)) {
      if (isSel && isSpeedwayClassField(opts) && dog.height_cm != null) {
        const cls = getSizeClass(dog.height_cm)
        const match = findSpeedwayClassMatch(opts, cls)
        if (match) filled[field.id] = match
      } else if (isSel && dog.agility_level) {
        const m = findAliasMatch(opts, AGILITY_ALIASES[dog.agility_level] ?? [])
        if (m) filled[field.id] = m
      } else if (isText && dog.agility_level) {
        filled[field.id] = dog.agility_level
      }
    }
  }

  return filled
}


export default function RegisterForm({ eventId, formFields = [], onSuccess }: Props) {
  const formId = useId()
  const supabase = getSupabaseBrowserClient()
  const { user } = useUser()
  const isLoggedIn = !!user

  const [base, setBase] = useState<BaseValues>(BASE_INITIAL)
  const [dynamic, setDynamic] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Dog picker state (only when logged in)
  const [userDogs, setUserDogs] = useState<Dog[]>([])
  const [selectedDogId, setSelectedDogId] = useState<string>('')
  const [profileName, setProfileName] = useState<string>('')

  useEffect(() => {
    if (!isLoggedIn || !user || !supabase) return

    // Fetch user's full name from profile
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setProfileName(data.full_name)
      })

    // Fetch user's dogs
    fetch('/api/dogs')
      .then(r => r.json())
      .then((dogs: Dog[]) => {
        if (Array.isArray(dogs)) setUserDogs(dogs)
      })
      .catch(() => {})
  }, [isLoggedIn, user?.id, supabase])

  function handleDogSelect(dogId: string) {
    setSelectedDogId(dogId)
    const dog = userDogs.find(d => d.id === dogId)
    if (dog) {
      setBase(prev => ({
        ...prev,
        dogName: dog.name,
        dogBreed: dog.breed ?? '',
      }))
      const filled = autofillFromDog(dog, formFields)
      setDynamic(prev => ({ ...prev, ...filled }))
    } else {
      // "Inny pies" — clear dog fields for manual entry
      setBase(prev => ({ ...prev, dogName: '', dogBreed: '' }))
    }
  }

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
    if (submittingRef.current) return
    submittingRef.current = true
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
          submittingRef.current = false
          return
        }
      }
    }

    try {
      setFieldErrors({})
      const processedExtra: Record<string, unknown> = {}
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
          ownerName: isLoggedIn ? (profileName || (user?.email?.split('@')[0] ?? '')) : base.ownerName,
          ownerEmail: isLoggedIn ? (user?.email ?? '') : base.ownerEmail,
          dogName: base.dogName,
          dogBreed: base.dogBreed,
          dogId: selectedDogId || null,
          extraFields: processedExtra,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        // Duplicate entry for same email + dog name
        if (res.status === 409 && typeof json.error === 'string' && json.error.includes('Istnieje już zapis')) {
          setFieldErrors({ ownerEmail: json.error, dogName: json.error })
          setLoading(false)
          submittingRef.current = false
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
      submittingRef.current = false
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

      {/* ── Zalogowany: info o użytkowniku + picker psa ── */}
      {isLoggedIn ? (
        <>
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-sm text-sky-700">
            <p className="font-medium">📧 Zapis jako: {user?.email}</p>
            {profileName && <p className="text-sky-600 text-xs mt-0.5">👤 {profileName}</p>}
          </div>

          {userDogs.length > 0 && (
            <div>
              <label className="form-label" htmlFor={`${formId}-dog-picker`}>Wybierz psa z profilu</label>
              <select
                id={`${formId}-dog-picker`}
                className="form-input"
                value={selectedDogId}
                onChange={e => handleDogSelect(e.target.value)}
              >
                <option value="">— inny pies (wpisz ręcznie) —</option>
                {userDogs.map(dog => (
                  <option key={dog.id} value={dog.id}>
                    {dog.name}{dog.breed ? ` – ${dog.breed}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="form-label" htmlFor={`${formId}-dog-name`}>Imię psa *</label>
            <input
              id={`${formId}-dog-name`}
              className={`form-input ${selectedDogId ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
              name="dogName"
              value={base.dogName}
              onChange={handleBase}
              required
              placeholder="Burek"
              disabled={!!selectedDogId}
              aria-describedby={fieldErrors.dogName ? `${formId}-dog-name-error` : undefined}
              aria-invalid={Boolean(fieldErrors.dogName)}
            />
            {fieldErrors.dogName && (
              <p id={`${formId}-dog-name-error`} className="text-xs text-red-600 mt-1">{fieldErrors.dogName}</p>
            )}
          </div>

          <div>
            <label className="form-label" htmlFor={`${formId}-dog-breed`}>Rasa psa</label>
            <input
              id={`${formId}-dog-breed`}
              className={`form-input ${selectedDogId ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
              name="dogBreed"
              value={base.dogBreed}
              onChange={handleBase}
              placeholder="Border Collie"
              disabled={!!selectedDogId}
            />
          </div>
        </>
      ) : (
        /* ── Niezalogowany: pełne pola ── */
        <>
          <div>
            <label className="form-label" htmlFor={`${formId}-owner-name`}>Imię i nazwisko właściciela *</label>
            <input
              id={`${formId}-owner-name`}
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
            <label className="form-label" htmlFor={`${formId}-owner-email`}>Adres e-mail *</label>
            <input
              id={`${formId}-owner-email`}
              className="form-input"
              type="email"
              name="ownerEmail"
              value={base.ownerEmail}
              onChange={handleBase}
              required
              placeholder="jan@example.com"
              autoComplete="email"
              aria-describedby={fieldErrors.ownerEmail ? `${formId}-owner-email-error` : undefined}
              aria-invalid={Boolean(fieldErrors.ownerEmail)}
            />
            {fieldErrors.ownerEmail && (
              <p id={`${formId}-owner-email-error`} className="text-xs text-red-600 mt-1">{fieldErrors.ownerEmail}</p>
            )}
          </div>

          <div>
            <label className="form-label" htmlFor={`${formId}-dog-name`}>Imię psa *</label>
            <input
              id={`${formId}-dog-name`}
              className="form-input"
              name="dogName"
              value={base.dogName}
              onChange={handleBase}
              required
              placeholder="Burek"
              aria-describedby={fieldErrors.dogName ? `${formId}-dog-name-error` : undefined}
              aria-invalid={Boolean(fieldErrors.dogName)}
            />
            {fieldErrors.dogName && (
              <p id={`${formId}-dog-name-error`} className="text-xs text-red-600 mt-1">{fieldErrors.dogName}</p>
            )}
          </div>

          <div>
            <label className="form-label" htmlFor={`${formId}-dog-breed`}>Rasa psa</label>
            <input
              id={`${formId}-dog-breed`}
              className="form-input"
              name="dogBreed"
              value={base.dogBreed}
              onChange={handleBase}
              placeholder="Border Collie"
            />
          </div>
        </>
      )}

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
        <div role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
          ⚠️ {error}
        </div>
      )}

      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading ? 'Wysyłanie...' : '✓ Wyślij zapis'}
      </button>

      <details className="group rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
        <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 font-medium text-slate-600 select-none list-none">
          Informacja o przetwarzaniu danych osobowych (RODO)
          <svg
            className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180 shrink-0 ml-2"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="px-3 pb-3 space-y-1.5 border-t border-slate-200 pt-2.5">
          <p>
            Administratorem Twoich danych osobowych jest organizator wydarzenia. Dane (imię i nazwisko, adres e-mail,
            imię psa) są przetwarzane wyłącznie w celu organizacji wydarzeń i kontaktu z uczestnikiem, na podstawie
            art. 6 ust. 1 lit. b RODO (wykonanie umowy/umowy przedwstępnej).
          </p>
          <p>
            Dane będą przechowywane przez czas organizacji i rozliczenia wydarzenia. Przysługuje Ci prawo dostępu,
            sprostowania, usunięcia oraz wniesienia skargi do Prezesa UODO (ul. Stawki 2, 00-193 Warszawa).
          </p>
          <p>
            Podanie danych jest dobrowolne, ale niezbędne do uczestnictwa w wydarzeniu.
            Platforma Dogdex pełni rolę procesora danych i przetwarza je wyłącznie w imieniu organizatora.
          </p>
        </div>
      </details>
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
  const controlId = useId()
  const label = (
    <label className="form-label" htmlFor={controlId}>
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
          <fieldset>
            <legend className="form-label">
              {field.label}{field.required && ' *'}
            </legend>
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
                      onChange={() => {
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
          </fieldset>
        )
      }

    case 'multiselect':
      return (
        <fieldset>
          <legend className="form-label">
            {field.label}{field.required && ' *'}
          </legend>
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
                    onChange={() => {
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
        </fieldset>
      )

    case 'select':
      return (
        <div>
          {label}
          <select
            id={controlId}
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
            id={controlId}
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
            id={controlId}
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
