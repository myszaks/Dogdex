import type { FormField } from '@/types'

export interface DateReplacement {
  from: string
  to: string
}

interface EventDateLike {
  start_at?: string | null
  end_at?: string | null
}

export function isoDatePart(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null

  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (direct) return direct[1]

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export function buildEventDateReplacements(
  previous: EventDateLike,
  next: EventDateLike,
): DateReplacement[] {
  const replacements: DateReplacement[] = []

  const pairs: Array<[string | null | undefined, string | null | undefined]> = [
    [previous.start_at, next.start_at],
    [previous.end_at, next.end_at],
  ]

  for (const [fromValue, toValue] of pairs) {
    const from = isoDatePart(fromValue)
    const to = isoDatePart(toValue)
    if (!from || !to || from === to) continue
    if (replacements.some(r => r.from === from)) continue
    replacements.push({ from, to })
  }

  return replacements
}

export function replaceMovedDateValue(value: unknown, replacements: DateReplacement[]): unknown {
  if (typeof value !== 'string') return value

  const datePart = isoDatePart(value)
  if (!datePart) return value

  const replacement = replacements.find(r => r.from === datePart)
  if (!replacement) return value

  return value.startsWith(datePart)
    ? `${replacement.to}${value.slice(datePart.length)}`
    : replacement.to
}

export function syncMultidateFormFields(
  fields: unknown,
  replacements: DateReplacement[],
): FormField[] | unknown {
  if (!Array.isArray(fields) || replacements.length === 0) return fields

  return fields.map(field => {
    if (!field || typeof field !== 'object') return field

    const typedField = field as FormField
    if (typedField.type !== 'multidate' || !Array.isArray(typedField.options)) {
      return typedField
    }

    return {
      ...typedField,
      options: typedField.options.map(option =>
        replaceMovedDateValue(option, replacements) as string
      ),
    }
  })
}

export function syncMultidateFormData(
  formData: Record<string, unknown> | null | undefined,
  multidateFieldIds: string[],
  replacements: DateReplacement[],
): { data: Record<string, unknown>; changed: boolean } {
  const data = { ...(formData ?? {}) }
  let changed = false

  if (multidateFieldIds.length === 0 || replacements.length === 0) {
    return { data, changed }
  }

  for (const fieldId of multidateFieldIds) {
    const value = data[fieldId]

    if (Array.isArray(value)) {
      const next = value.map(item => replaceMovedDateValue(item, replacements))
      if (JSON.stringify(next) !== JSON.stringify(value)) {
        data[fieldId] = next
        changed = true
      }
      continue
    }

    const nextValue = replaceMovedDateValue(value, replacements)
    if (nextValue !== value) {
      data[fieldId] = nextValue
      changed = true
    }
  }

  return { data, changed }
}
