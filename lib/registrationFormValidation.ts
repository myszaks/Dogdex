import type { FormField } from '@/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SUPPORTED_TYPES = new Set<FormField['type']>([
  'text',
  'number',
  'email',
  'select',
  'multiselect',
  'multidate',
  'textarea',
  'checkbox',
])

type ValidationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string }

function isEmpty(value: unknown): boolean {
  return value == null
    || value === ''
    || (Array.isArray(value) && value.length === 0)
}

function fieldName(field: FormField): string {
  return field.label?.trim().slice(0, 120) || 'Pole formularza'
}

function normalizeArray(value: unknown): string[] | null {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : null
  if (!values) return null

  const normalized = values.map(item => typeof item === 'string' ? item.trim() : '')
  if (normalized.some(item => !item || item.length > 500)) return null
  return [...new Set(normalized)]
}

export function validateRegistrationFormData(
  fieldsValue: unknown,
  submittedValue: unknown,
): ValidationResult {
  if (
    submittedValue == null
    || typeof submittedValue !== 'object'
    || Array.isArray(submittedValue)
  ) {
    if (submittedValue == null) submittedValue = {}
    else return { ok: false, error: 'Nieprawidłowe dane formularza' }
  }

  const fields = Array.isArray(fieldsValue)
    ? fieldsValue.filter((field): field is FormField => (
        !!field
        && typeof field === 'object'
        && typeof (field as { id?: unknown }).id === 'string'
        && SUPPORTED_TYPES.has((field as { type?: FormField['type'] }).type as FormField['type'])
      ))
    : []

  const submitted = submittedValue as Record<string, unknown>
  const allowedIds = new Set(fields.map(field => field.id))
  const submittedKeys = Object.keys(submitted)

  if (submittedKeys.length > 100 || submittedKeys.some(key => !allowedIds.has(key))) {
    return { ok: false, error: 'Formularz zawiera nieobsługiwane pola' }
  }

  const normalized: Record<string, unknown> = {}
  for (const field of fields) {
    const value = submitted[field.id]
    const label = fieldName(field)

    if (isEmpty(value)) {
      if (field.required) return { ok: false, error: `Pole „${label}” jest wymagane` }
      continue
    }

    if (field.type === 'multiselect' || field.type === 'multidate') {
      const values = normalizeArray(value)
      if (!values) return { ok: false, error: `Pole „${label}” ma nieprawidłową wartość` }
      if (field.required && values.length === 0) {
        return { ok: false, error: `Pole „${label}” jest wymagane` }
      }
      const options = Array.isArray(field.options) ? field.options : []
      if (values.some(item => !options.includes(item))) {
        return { ok: false, error: `Pole „${label}” zawiera niedozwoloną opcję` }
      }
      if (field.type === 'multidate' && values.some(item => !DATE_RE.test(item))) {
        return { ok: false, error: `Pole „${label}” zawiera nieprawidłową datę` }
      }
      normalized[field.id] = values
      continue
    }

    if (field.type === 'checkbox') {
      const checked = value === true || value === 'true'
      if (field.required && !checked) {
        return { ok: false, error: `Pole „${label}” jest wymagane` }
      }
      normalized[field.id] = checked
      continue
    }

    if (field.type === 'number') {
      const numeric = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Number(value)
          : Number.NaN
      if (!Number.isFinite(numeric)) {
        return { ok: false, error: `Pole „${label}” musi być liczbą` }
      }
      normalized[field.id] = numeric
      continue
    }

    if (typeof value !== 'string') {
      return { ok: false, error: `Pole „${label}” ma nieprawidłową wartość` }
    }

    const text = value.trim()
    const maxLength = field.type === 'textarea' ? 5000 : 500
    if (!text || text.length > maxLength) {
      return { ok: false, error: `Pole „${label}” ma nieprawidłową długość` }
    }
    if (field.type === 'email' && !EMAIL_RE.test(text)) {
      return { ok: false, error: `Pole „${label}” musi zawierać prawidłowy e-mail` }
    }
    if (
      field.type === 'select'
      && (!Array.isArray(field.options) || !field.options.includes(text))
    ) {
      return { ok: false, error: `Pole „${label}” zawiera niedozwoloną opcję` }
    }

    normalized[field.id] = text
  }

  return { ok: true, data: normalized }
}
