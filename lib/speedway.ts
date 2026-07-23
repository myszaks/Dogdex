import type { FormField } from '@/types'

// Kolejność klas jest równocześnie kolejnością startów w widokach Speedway.
export const SIZE_CLASSES = ['XS', 'S', 'M', 'L', 'CHART', 'SPORT'] as const
export type SizeClass = (typeof SIZE_CLASSES)[number]

export const SIZE_CLASS_LABELS: Record<SizeClass, string> = {
  XS: 'XS  (< 30 cm)',
  S: 'S  (30 – 39.9 cm)',
  M: 'M  (40 – 49.9 cm)',
  L: 'L  (≥ 50 cm)',
  CHART: 'Chart',
  SPORT: 'Sport',
}

export function getSizeClass(heightCm: number): SizeClass {
  if (heightCm >= 50) return 'L'
  if (heightCm >= 40) return 'M'
  if (heightCm >= 30) return 'S'
  return 'XS'
}

export const SPEEDWAY_HEIGHT_FIELD_ID = 'height_cm'
export const SPEEDWAY_HEIGHT_FIELD: FormField = {
  id: SPEEDWAY_HEIGHT_FIELD_ID,
  label: 'Wzrost psa w kłębie (cm)',
  type: 'number',
  required: true,
  placeholder: 'np. 45',
  description: 'Klasa startowa zostanie przydzielona automatycznie: XS (<30cm), S (30–39.9cm), M (40–49.9cm), L (≥50cm). Charty trafiają do osobnej klasy.',
}

export const SPEEDWAY_SPORT_FIELD_ID = 'sport_class'
export const SPEEDWAY_SPORT_FIELD: FormField = {
  id: SPEEDWAY_SPORT_FIELD_ID,
  label: 'Klasa sport',
  type: 'checkbox',
  required: false,
  description: 'Dla psów będących w treningu sportowym',
}

/**
 * Oficjalne rasy grupy FCI 10 wraz z popularnymi polskimi i angielskimi
 * nazwami. Uwzględniamy też prowizorycznie uznanego Kazakh Tazy.
 */
export const SIGHTHOUND_BREED_ALIASES = [
  'chart',
  'sighthound',
  'afghan hound',
  'saluki',
  'borzoi',
  'borzoj',
  'russkaya psovaya borzaya',
  'deerhound',
  'irish wolfhound',
  'wilczarz irlandzki',
  'greyhound',
  'whippet',
  'magyar agar',
  'hungarian greyhound',
  'charcik wloski',
  'piccolo levriero italiano',
  'italian sighthound',
  'italian greyhound',
  'azawakh',
  'sloughi',
  'galgo',
  'galgo espanol',
  'spanish greyhound',
  'kazakh tazy',
  'tazy',
] as const

function normalizeSearchText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function isSighthoundBreed(value: unknown): boolean {
  const breed = normalizeSearchText(value)
  if (!breed) return false

  const paddedBreed = ` ${breed} `
  return SIGHTHOUND_BREED_ALIASES.some(alias =>
    paddedBreed.includes(` ${alias} `)
  )
}

export function normalizeSizeClass(value: unknown): SizeClass | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  if (normalized === 'XL') return 'L'
  return (SIZE_CLASSES as readonly string[]).includes(normalized)
    ? normalized as SizeClass
    : null
}

export function isSpeedwaySportFieldKey(key: string): boolean {
  const normalized = normalizeSearchText(key).replace(/\s+/g, '_')
  return (
    normalized === SPEEDWAY_SPORT_FIELD_ID ||
    normalized.startsWith(`${SPEEDWAY_SPORT_FIELD_ID}_`) ||
    normalized === 'speedway_sport_class' ||
    normalized.startsWith('speedway_sport_class_') ||
    normalized === 'klasa_sport' ||
    normalized.startsWith('klasa_sport_')
  )
}

export function isSpeedwayHeightFieldKey(key: string): boolean {
  const normalized = normalizeSearchText(key).replace(/\s+/g, '_')
  return (
    normalized === SPEEDWAY_HEIGHT_FIELD_ID ||
    normalized.startsWith(`${SPEEDWAY_HEIGHT_FIELD_ID}_`) ||
    normalized.includes('wzrost') ||
    normalized.includes('wysokosc') ||
    normalized.includes('height')
  )
}

export function isSpeedwayClassificationFieldKey(key: string): boolean {
  return isSpeedwayHeightFieldKey(key) || isSpeedwaySportFieldKey(key)
}

function isTruthySelection(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value !== 'string') return false
  return ['true', '1', 'yes', 'tak', 'on', 'sport'].includes(value.trim().toLowerCase())
}

export function isSportClassSelected(
  formData: Record<string, unknown> | null | undefined,
): boolean {
  if (!formData) return false

  return Object.entries(formData).some(([key, value]) =>
    (isSpeedwaySportFieldKey(key) && isTruthySelection(value)) ||
    normalizeSizeClass(value) === 'SPORT'
  )
}

export function ensureSpeedwayClassificationFields(
  formFields: unknown,
  eventTypeId: unknown,
): FormField[] {
  const fields = Array.isArray(formFields) ? formFields as FormField[] : []
  if (eventTypeId !== 'speedway') return fields

  let hasHeightField = false
  let hasSportField = false
  const normalizedFields: FormField[] = []

  for (const field of fields) {
    if (!field || typeof field !== 'object' || typeof field.id !== 'string') continue

    if (isSpeedwayHeightFieldKey(field.id)) {
      if (hasHeightField) continue
      hasHeightField = true
      normalizedFields.push({
        ...field,
        type: 'number',
        required: true,
        label: SPEEDWAY_HEIGHT_FIELD.label,
        placeholder: SPEEDWAY_HEIGHT_FIELD.placeholder,
        description: SPEEDWAY_HEIGHT_FIELD.description,
      })
      continue
    }

    if (isSpeedwaySportFieldKey(field.id)) {
      if (hasSportField) continue
      hasSportField = true
      normalizedFields.push({
        ...field,
        type: 'checkbox',
        required: false,
        label: SPEEDWAY_SPORT_FIELD.label,
        description: SPEEDWAY_SPORT_FIELD.description,
        options: undefined,
        placeholder: undefined,
      })
      continue
    }

    normalizedFields.push(field)
  }

  if (!hasHeightField) normalizedFields.push({ ...SPEEDWAY_HEIGHT_FIELD })
  if (!hasSportField) normalizedFields.push({ ...SPEEDWAY_SPORT_FIELD })
  return normalizedFields
}

/** Prędkość w km/h na podstawie najlepszego czasu i długości toru */
export function computeSpeedKmh(bestMs: number, distanceM: number): number {
  if (bestMs <= 0 || distanceM <= 0) return 0
  const seconds = bestMs / 1000
  return Math.round(((distanceM / seconds) * 3.6) * 100) / 100
}

/** Formatuje ms → "4.57 s" */
export function formatRunTime(ms: number): string {
  if (ms <= 0) return '—'
  return (ms / 1000).toFixed(2) + ' s'
}

/** Parsuje string sekund → ms lub null */
export function parseRunMs(s: string): number | null {
  const v = parseFloat(s.replace(',', '.'))
  if (isNaN(v) || v <= 0) return null
  return Math.round(v * 1000)
}

function parseHeightCm(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = parseFloat(String(value).replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

/** Wyznacza najlepszy czas (null jeśli oba brak) */
export function bestMs(run1: number | null, run2: number | null): number | null {
  if (run1 !== null && run2 !== null) return Math.min(run1, run2)
  return run1 ?? run2
}

/** Emoji medalu dla podium */
export function medalEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

/**
 * Wyciąga klasę startową z form_data rejestracji.
 * Obsługuje trzy przypadki:
 *   1. Zaznaczona klasa Sport → używa jej niezależnie od pozostałych danych
 *   2. Pole `height_cm` (number/string) → oblicza klasę automatycznie
 *   3. Dowolne pole z poprawnym symbolem klasy → używa go bezpośrednio
 *      (obsługa niestandardowych nazw pól, np. `klasa`, `dog_class`, itp.)
 */
export function extractSizeClassFromFormData(
  formData: Record<string, unknown> | null | undefined
): SizeClass | null {
  if (!formData) return null

  if (isSportClassSelected(formData)) return 'SPORT'

  // Jawnie wybrana klasa Chart również ma pierwszeństwo przed wzrostem.
  for (const value of Object.values(formData)) {
    if (normalizeSizeClass(value) === 'CHART') return 'CHART'
  }

  // height_cm → przelicz wzrost na klasę
  for (const [key, value] of Object.entries(formData)) {
    if (!isSpeedwayHeightFieldKey(key)) continue
    const height = parseHeightCm(value)
    if (height !== null) return getSizeClass(height)
  }

  // Skanuj wszystkie wartości — poprawny symbol klasy traktujemy jako klasę.
  for (const value of Object.values(formData)) {
    const sizeClass = normalizeSizeClass(value)
    if (sizeClass) return sizeClass
  }

  return null
}

export function extractSizeClassFromRegistration(
  formData: Record<string, unknown> | null | undefined,
  dogHeightCm: unknown,
  registrationBreed?: unknown,
  profileBreed?: unknown,
): SizeClass | null {
  // Kolejność biznesowa: Sport → Chart → klasa wzrostowa.
  if (isSportClassSelected(formData)) return 'SPORT'
  if (isSighthoundBreed(registrationBreed) || isSighthoundBreed(profileBreed)) {
    return 'CHART'
  }

  const fromForm = extractSizeClassFromFormData(formData)
  if (fromForm) return fromForm

  const height = parseHeightCm(dogHeightCm)
  return height !== null ? getSizeClass(height) : null
}
