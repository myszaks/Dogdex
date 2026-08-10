export const DOG_DOCUMENT_TYPES = [
  'rabies_vaccination',
  'pedigree',
  'sport_license',
  'qualification',
  'health_certificate',
  'insurance',
  'other',
] as const

export type DogDocumentType = (typeof DOG_DOCUMENT_TYPES)[number]

export const DOG_DOCUMENT_TYPE_LABELS: Record<DogDocumentType, string> = {
  rabies_vaccination: 'Szczepienie przeciw wściekliźnie',
  pedigree: 'Rodowód',
  sport_license: 'Licencja sportowa',
  qualification: 'Kwalifikacja lub certyfikat',
  health_certificate: 'Zaświadczenie zdrowotne',
  insurance: 'Ubezpieczenie',
  other: 'Inny dokument',
}

export interface DogDocument {
  id: string
  dog_id: string
  owner_id: string
  type: DogDocumentType
  label: string
  document_number: string | null
  issuer: string | null
  issued_at: string | null
  expires_at: string | null
  storage_path: string | null
  file_name: string | null
  file_type: string | null
  file_size: number | null
  created_at: string
  updated_at: string
}

export interface EventDocumentRequirement {
  type: Exclude<DogDocumentType, 'other'>
  mustBeValidOnEventDate: boolean
}

export interface EventEntryRequirements {
  minAgeMonths: number | null
  maxAgeMonths: number | null
  minHeightCm: number | null
  maxHeightCm: number | null
  allowedGenders: Array<'male' | 'female'>
  documents: EventDocumentRequirement[]
}

export const EMPTY_EVENT_ENTRY_REQUIREMENTS: EventEntryRequirements = {
  minAgeMonths: null,
  maxAgeMonths: null,
  minHeightCm: null,
  maxHeightCm: null,
  allowedGenders: [],
  documents: [],
}

export function isDogDocumentType(value: unknown): value is DogDocumentType {
  return typeof value === 'string' && (DOG_DOCUMENT_TYPES as readonly string[]).includes(value)
}

function nullableNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

export function normalizeEventEntryRequirements(value: unknown): EventEntryRequirements {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_EVENT_ENTRY_REQUIREMENTS, allowedGenders: [], documents: [] }
  }
  const source = value as Record<string, unknown>
  const allowedGenders = Array.isArray(source.allowedGenders)
    ? [...new Set(source.allowedGenders.filter((item): item is 'male' | 'female' => item === 'male' || item === 'female'))]
    : []
  const documents: EventDocumentRequirement[] = []
  if (Array.isArray(source.documents)) {
    for (const item of source.documents) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const candidate = item as Record<string, unknown>
      if (!isDogDocumentType(candidate.type) || candidate.type === 'other') continue
      if (documents.some(document => document.type === candidate.type)) continue
      documents.push({
        type: candidate.type,
        mustBeValidOnEventDate: candidate.mustBeValidOnEventDate !== false,
      })
    }
  }
  return {
    minAgeMonths: nullableNumber(source.minAgeMonths, 0, 360),
    maxAgeMonths: nullableNumber(source.maxAgeMonths, 0, 360),
    minHeightCm: nullableNumber(source.minHeightCm, 1, 200),
    maxHeightCm: nullableNumber(source.maxHeightCm, 1, 200),
    allowedGenders,
    documents,
  }
}

export function validateEventEntryRequirements(value: EventEntryRequirements): string | null {
  if (value.minAgeMonths !== null && value.maxAgeMonths !== null && value.minAgeMonths > value.maxAgeMonths) {
    return 'Minimalny wiek psa nie może być większy niż maksymalny.'
  }
  if (value.minHeightCm !== null && value.maxHeightCm !== null && value.minHeightCm > value.maxHeightCm) {
    return 'Minimalny wzrost psa nie może być większy niż maksymalny.'
  }
  return null
}

export function hasEventEntryRequirements(value: EventEntryRequirements): boolean {
  return value.minAgeMonths !== null
    || value.maxAgeMonths !== null
    || value.minHeightCm !== null
    || value.maxHeightCm !== null
    || value.allowedGenders.length > 0
    || value.documents.length > 0
}

export interface DogEligibilityInput {
  dog: {
    birth_date?: string | null
    height_cm?: number | null
    gender?: 'male' | 'female' | null
    rabies_vaccine_expiry?: string | null
  }
  documents: Array<Pick<DogDocument, 'type' | 'expires_at'>>
  requirements: EventEntryRequirements
  eventStartsAt: string | null
  eventEndsAt: string | null
}

export interface DogEligibilityIssue {
  code: 'birth_date' | 'age' | 'height' | 'gender' | 'document'
  message: string
  documentType?: DogDocumentType
}

function ageInMonths(birthDate: string, referenceDate: string): number | null {
  const birth = new Date(`${birthDate}T00:00:00Z`)
  const reference = new Date(referenceDate)
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime()) || birth > reference) return null
  let months = (reference.getUTCFullYear() - birth.getUTCFullYear()) * 12
    + reference.getUTCMonth() - birth.getUTCMonth()
  if (reference.getUTCDate() < birth.getUTCDate()) months -= 1
  return months
}

export function validateDogEligibility(input: DogEligibilityInput): DogEligibilityIssue[] {
  const issues: DogEligibilityIssue[] = []
  const requirements = normalizeEventEntryRequirements(input.requirements)
  const referenceDate = input.eventStartsAt ?? input.eventEndsAt

  if (requirements.minAgeMonths !== null || requirements.maxAgeMonths !== null) {
    if (!input.dog.birth_date || !referenceDate) {
      issues.push({ code: 'birth_date', message: 'Uzupełnij datę urodzenia psa.' })
    } else {
      const age = ageInMonths(input.dog.birth_date, referenceDate)
      if (age === null) {
        issues.push({ code: 'birth_date', message: 'Data urodzenia psa jest nieprawidłowa.' })
      } else {
        if (requirements.minAgeMonths !== null && age < requirements.minAgeMonths) {
          issues.push({ code: 'age', message: `Pies musi mieć co najmniej ${requirements.minAgeMonths} mies.` })
        }
        if (requirements.maxAgeMonths !== null && age > requirements.maxAgeMonths) {
          issues.push({ code: 'age', message: `Pies może mieć maksymalnie ${requirements.maxAgeMonths} mies.` })
        }
      }
    }
  }

  if (requirements.minHeightCm !== null || requirements.maxHeightCm !== null) {
    const height = input.dog.height_cm
    if (height === null || height === undefined) {
      issues.push({ code: 'height', message: 'Uzupełnij wzrost psa w kłębie.' })
    } else {
      if (requirements.minHeightCm !== null && height < requirements.minHeightCm) {
        issues.push({ code: 'height', message: `Wymagany wzrost to co najmniej ${requirements.minHeightCm} cm.` })
      }
      if (requirements.maxHeightCm !== null && height > requirements.maxHeightCm) {
        issues.push({ code: 'height', message: `Dopuszczalny wzrost to maksymalnie ${requirements.maxHeightCm} cm.` })
      }
    }
  }

  if (requirements.allowedGenders.length > 0) {
    if (!input.dog.gender) {
      issues.push({ code: 'gender', message: 'Uzupełnij płeć psa.' })
    } else if (!requirements.allowedGenders.includes(input.dog.gender)) {
      issues.push({ code: 'gender', message: 'Płeć psa nie spełnia warunków tego wydarzenia.' })
    }
  }

  const validOn = new Date(input.eventEndsAt ?? input.eventStartsAt ?? '9999-12-31T23:59:59Z')
  for (const requirement of requirements.documents) {
    const matching = input.documents.filter(document => document.type === requirement.type)
    if (requirement.type === 'rabies_vaccination' && input.dog.rabies_vaccine_expiry) {
      matching.push({
        type: 'rabies_vaccination',
        expires_at: input.dog.rabies_vaccine_expiry,
      })
    }
    const acceptable = matching.some(document => {
      if (!requirement.mustBeValidOnEventDate || !document.expires_at) return true
      const expiry = new Date(`${document.expires_at}T23:59:59Z`)
      return !Number.isNaN(expiry.getTime()) && expiry >= validOn
    })
    if (!acceptable) {
      issues.push({
        code: 'document',
        documentType: requirement.type,
        message: `Brak ważnego dokumentu: ${DOG_DOCUMENT_TYPE_LABELS[requirement.type]}.`,
      })
    }
  }
  return issues
}
