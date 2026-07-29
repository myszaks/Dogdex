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

const OPTION_FIELD_TYPES = new Set<FormField['type']>([
  'select',
  'multiselect',
  'multidate',
])

export interface FormFieldDefinitionIssue {
  fieldId?: string
  message: string
}

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

export function validateFormFieldDefinitions(
  fieldsValue: unknown,
  options: { allowEmptyOptions?: boolean } = {},
): FormFieldDefinitionIssue[] {
  if (!Array.isArray(fieldsValue)) {
    return [{ message: 'Pola formularza muszą być listą.' }]
  }
  if (fieldsValue.length > 100) {
    return [{ message: 'Formularz może zawierać maksymalnie 100 pól.' }]
  }

  const issues: FormFieldDefinitionIssue[] = []
  const seenIds = new Set<string>()

  fieldsValue.forEach((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      issues.push({ message: `Pole ${index + 1} ma nieprawidłową konfigurację.` })
      return
    }

    const field = value as Partial<FormField>
    const fieldId = typeof field.id === 'string' ? field.id.trim() : ''
    const label = typeof field.label === 'string' ? field.label.trim() : ''
    const displayName = label || `Pole ${index + 1}`

    if (!fieldId) {
      issues.push({ message: `${displayName}: brakuje identyfikatora.` })
    } else if (seenIds.has(fieldId)) {
      issues.push({ fieldId, message: `${displayName}: identyfikator pola nie jest unikalny.` })
    } else {
      seenIds.add(fieldId)
    }

    if (!label) {
      issues.push({ fieldId, message: `Pole ${index + 1}: wpisz nazwę widoczną dla uczestnika.` })
    } else if (label.length > 120) {
      issues.push({ fieldId, message: `${displayName}: nazwa może mieć maksymalnie 120 znaków.` })
    }

    if (!field.type || !SUPPORTED_TYPES.has(field.type)) {
      issues.push({ fieldId, message: `${displayName}: wybierz obsługiwany typ pola.` })
      return
    }
    if (typeof field.required !== 'boolean') {
      issues.push({ fieldId, message: `${displayName}: ustaw, czy pole jest wymagane.` })
    }
    if (!OPTION_FIELD_TYPES.has(field.type)) return

    const rawOptions = Array.isArray(field.options) ? field.options : []
    const normalizedOptions = rawOptions
      .filter((option): option is string => typeof option === 'string')
      .map(option => option.trim())
    const hasInvalidOption = rawOptions.length !== normalizedOptions.length
      || normalizedOptions.some(option => !option || option.length > 500)

    if (hasInvalidOption) {
      issues.push({ fieldId, message: `${displayName}: usuń puste lub nieprawidłowe opcje.` })
    }
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      issues.push({ fieldId, message: `${displayName}: każda opcja musi być unikalna.` })
    }
    if (normalizedOptions.length > 100) {
      issues.push({ fieldId, message: `${displayName}: można dodać maksymalnie 100 opcji.` })
    }
    if (!options.allowEmptyOptions && normalizedOptions.length === 0) {
      issues.push({
        fieldId,
        message: field.type === 'multidate'
          ? `${displayName}: dodaj co najmniej jeden dostępny termin.`
          : `${displayName}: dodaj co najmniej jedną opcję odpowiedzi.`,
      })
    }
    if (
      field.type === 'multidate'
      && normalizedOptions.some(option => !DATE_RE.test(option))
    ) {
      issues.push({ fieldId, message: `${displayName}: wszystkie terminy muszą być prawidłowymi datami.` })
    }
  })

  return issues
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
