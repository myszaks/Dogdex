import { getEventType } from '@/lib/eventTypes'
import { parseSizeClassValue, SIZE_CLASSES } from '@/lib/speedway'
import type { FormField } from '@/types'
import type { CompetitionFormatDefinition } from '@/types/competition'

export interface EventCompetitionDependencyIssue {
  path: string
  message: string
}

function normalizedFieldText(field: FormField): string {
  return `${field.id} ${field.label}`
    .toLocaleLowerCase('pl')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isHeightSource(field: FormField): boolean {
  const text = normalizedFieldText(field)
  return field.required
    && field.type === 'number'
    && (
      text.includes('height_cm')
      || text.includes('wzrost')
      || text.includes('wysokosc')
      || text.includes('height')
    )
}

function isSpeedwaySportSource(field: FormField): boolean {
  const text = normalizedFieldText(field)
  return field.type === 'checkbox'
    && (text.includes('sport_class') || text.includes('klasa sport'))
}

function isSpeedwaySighthoundSource(field: FormField): boolean {
  const text = normalizedFieldText(field)
  return field.type === 'checkbox'
    && (
      text.includes('sighthound_class')
      || text.includes('klasa chart')
      || text.includes('chart class')
    )
}

function isCompleteSizeClassSource(field: FormField): boolean {
  if (!field.required || field.type !== 'select') {
    return false
  }
  const available = new Set((field.options ?? []).map(parseSizeClassValue).filter(Boolean))
  return SIZE_CLASSES.every(sizeClass => available.has(sizeClass))
}

export function hasSizeClassRegistrationSource(fields: FormField[]): boolean {
  return fields.some(field => isHeightSource(field) || isCompleteSizeClassSource(field))
}

export function hasDogHeightRegistrationSource(fields: FormField[]): boolean {
  return fields.some(isHeightSource)
}

export function hasSpeedwaySportRegistrationSource(fields: FormField[]): boolean {
  return fields.some(isSpeedwaySportSource)
}

export function hasSpeedwaySighthoundRegistrationSource(fields: FormField[]): boolean {
  return fields.some(isSpeedwaySighthoundSource)
}

function collectReferencePaths(value: unknown, references: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach(item => collectReferencePaths(item, references))
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  if (record.op === 'ref' && typeof record.path === 'string') {
    references.add(record.path)
  }
  Object.values(record).forEach(item => collectReferencePaths(item, references))
}

export function validateEventCompetitionDependencies(
  fieldsValue: unknown,
  definition: CompetitionFormatDefinition | null,
): EventCompetitionDependencyIssue[] {
  if (!definition) return []
  const fields = Array.isArray(fieldsValue)
    ? fieldsValue.filter((field): field is FormField =>
        Boolean(field)
        && typeof field === 'object'
        && typeof (field as FormField).id === 'string'
      )
    : []
  const byId = new Map(fields.map(field => [field.id, field]))
  const references = new Set<string>()
  collectReferencePaths(definition, references)
  const issues: EventCompetitionDependencyIssue[] = []

  for (const reference of references) {
    if (reference === 'registration.speedway_sport') {
      if (!hasSpeedwaySportRegistrationSource(fields)) {
        issues.push({
          path: reference,
          message: 'Schemat zawiera klasę Sport. Formularz zapisów musi zawierać opcjonalne pole „Klasa sport”.',
        })
      }
      continue
    }

    if (reference === 'registration.speedway_sighthound') {
      if (!hasSpeedwaySighthoundRegistrationSource(fields)) {
        issues.push({
          path: reference,
          message: 'Schemat zawiera klasę chartów. Formularz zapisów musi zawierać opcjonalne pole „Klasa chartów”.',
        })
      }
      continue
    }

    if (reference === 'registration.dog_height_cm') {
      if (!hasDogHeightRegistrationSource(fields)) {
        issues.push({
          path: reference,
          message: 'Schemat dzieli psy według progów wzrostu. Formularz zapisów musi wymagać wzrostu psa w centymetrach.',
        })
      }
      continue
    }

    if (reference === 'registration.size_class') {
      if (!hasSizeClassRegistrationSource(fields)) {
        issues.push({
          path: reference,
          message: 'Schemat klasyfikuje psy według wzrostu. Formularz zapisów musi wymagać wzrostu psa albo pełnej klasy XS–XL.',
        })
      }
      continue
    }

    if (reference.startsWith('registration.form_data.')) {
      const fieldId = reference.slice('registration.form_data.'.length).split('.')[0]
      const field = byId.get(fieldId)
      if (!field) {
        issues.push({
          path: reference,
          message: `Schemat korzysta z odpowiedzi „${fieldId}”, ale formularz zapisów nie zawiera takiego pola.`,
        })
      } else if (!field.required) {
        issues.push({
          path: reference,
          message: `Pole „${field.label}” jest używane w obliczeniach, dlatego musi być wymagane.`,
        })
      }
      continue
    }

    if (
      reference.startsWith('registration.')
      && !['registration.id', 'registration.checked_in'].some(path =>
        reference === path || reference.startsWith(`${path}.`)
      )
      && reference !== 'registration.form_data'
    ) {
      issues.push({
        path: reference,
        message: `Schemat odwołuje się do nieobsługiwanego parametru zapisu „${reference}”.`,
      })
    }
  }

  return issues
}

export function ensureEventTypeRegistrationDependencies(
  eventTypeId: string | null,
  fields: FormField[],
): FormField[] {
  if (eventTypeId !== 'speedway') return fields
  const defaultFields = getEventType('speedway')?.defaultFields ?? []
  let nextFields = fields

  const defaultHeightField = defaultFields.find(field => field.id === 'height_cm')
  if (defaultHeightField && !hasDogHeightRegistrationSource(nextFields)) {
    const conflictingIndex = nextFields.findIndex(field => field.id === defaultHeightField.id)
    nextFields = conflictingIndex >= 0
      ? nextFields.map((field, index) =>
          index === conflictingIndex ? { ...defaultHeightField } : field
        )
      : [{ ...defaultHeightField }, ...nextFields]
  }

  const specialDefaults = [
    {
      field: defaultFields.find(field => field.id === 'sport_class'),
      present: hasSpeedwaySportRegistrationSource(nextFields),
    },
    {
      field: defaultFields.find(field => field.id === 'sighthound_class'),
      present: hasSpeedwaySighthoundRegistrationSource(nextFields),
    },
  ]
  const missingSpecialFields = specialDefaults
    .filter(candidate => candidate.field && !candidate.present)
    .map(candidate => ({ ...candidate.field! }))

  return missingSpecialFields.length > 0
    ? [...nextFields, ...missingSpecialFields]
    : nextFields
}
