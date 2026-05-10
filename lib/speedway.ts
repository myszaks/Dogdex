// Kategorie rozmiarowe dla Speedway wg wzrostu psa w kłębie

export const SIZE_CLASSES = ['XS', 'S', 'M', 'L', 'XL'] as const
export type SizeClass = (typeof SIZE_CLASSES)[number]

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
  const seconds = bestMs / 1000
  return Math.round(((distanceM / seconds) * 3.6) * 100) / 100
}

/** Formatuje ms → "4.57 s" */
export function formatRunTime(ms: number): string {
  return (ms / 1000).toFixed(2) + ' s'
}

/** Parsuje string sekund → ms lub null */
export function parseRunMs(s: string): number | null {
  const v = parseFloat(s.replace(',', '.'))
  if (isNaN(v) || v <= 0) return null
  return Math.round(v * 1000)
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
