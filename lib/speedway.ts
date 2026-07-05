// Kategorie rozmiarowe dla Speedway wg wzrostu psa w kłębie

export const SIZE_CLASSES = ['XS', 'S', 'M', 'L', 'XL'] as const
export type SizeClass = (typeof SIZE_CLASSES)[number]
export const TRACK_DISTANCE_MIN_M = 1
export const TRACK_DISTANCE_MAX_M = 500
export const MAX_STORED_SPEED_KMH = 999.99

export const SIZE_CLASS_LABELS: Record<SizeClass, string> = {
  XS: 'XS  (< 30 cm)',
  S: 'S  (30 – 39.9 cm)',
  M: 'M  (40 – 49.9 cm)',
  L: 'L  (50 – 59.9 cm)',
  XL: 'XL  (≥ 60 cm)',
}

export function getSizeClass(heightCm: number): SizeClass {
  if (heightCm >= 60) return 'XL'
  if (heightCm >= 50) return 'L'
  if (heightCm >= 40) return 'M'
  if (heightCm >= 30) return 'S'
  return 'XS'
}

/** Prędkość w km/h na podstawie najlepszego czasu i długości toru */
export function computeSpeedKmh(bestMs: number, distanceM: number): number {
  if (bestMs <= 0 || distanceM <= 0) return 0
  const seconds = bestMs / 1000
  return Math.round(((distanceM / seconds) * 3.6) * 100) / 100
}

export function parseTrackDistanceM(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function isValidTrackDistanceM(value: unknown): boolean {
  const n = parseTrackDistanceM(value)
  return n !== null && n >= TRACK_DISTANCE_MIN_M && n <= TRACK_DISTANCE_MAX_M
}

export function computeStoredSpeedKmh(bestMs: number, distanceM: number): number | null {
  const speed = computeSpeedKmh(bestMs, distanceM)
  return speed > MAX_STORED_SPEED_KMH ? null : speed
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

function isHeightFieldKey(key: string): boolean {
  const normalized = key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return (
    normalized === 'height_cm' ||
    normalized.startsWith('height_cm_') ||
    normalized.includes('wzrost') ||
    normalized.includes('wysokosc') ||
    normalized.includes('height')
  )
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
 * Wyciąga klasę rozmiarową z form_data rejestracji.
 * Obsługuje trzy przypadki:
 *   1. Pole `height_cm` (number/string) → oblicza klasę automatycznie
 *   2. Pole `size_class` z wartością XS/S/M/L/XL → używa bezpośrednio
 *   3. JAKIEKOLWIEK inne pole, którego wartość to XS/S/M/L/XL → używa go
 *      (obsługa niestandardowych nazw pól, np. `klasa`, `dog_class`, itp.)
 */
export function extractSizeClassFromFormData(
  formData: Record<string, unknown> | null | undefined
): SizeClass | null {
  if (!formData) return null

  // 1. height_cm → przelicz wzrost na klasę
  for (const [key, value] of Object.entries(formData)) {
    if (!isHeightFieldKey(key)) continue
    const height = parseHeightCm(value)
    if (height !== null) return getSizeClass(height)
  }

  // 2. Skanuj wszystkie wartości — każda wartość będąca literałem XS/S/M/L/XL traktowana
  //    jako klasa (obsługuje size_class, klasa, dog_class, kategoria, etc.)
  for (const v of Object.values(formData)) {
    if (typeof v === 'string' && (SIZE_CLASSES as readonly string[]).includes(v)) {
      return v as SizeClass
    }
  }

  return null
}

export function extractSizeClassFromRegistration(
  formData: Record<string, unknown> | null | undefined,
  dogHeightCm: unknown,
): SizeClass | null {
  const fromForm = extractSizeClassFromFormData(formData)
  if (fromForm) return fromForm

  const height = parseHeightCm(dogHeightCm)
  return height !== null ? getSizeClass(height) : null
}
