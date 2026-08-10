export interface SportPassportEntry {
  eventTypeId: string | null
  status: string
  eventStatus: string | null
  hasResult: boolean
  rank: number | null
}

export interface SportDisciplineSummary {
  eventTypeId: string
  starts: number
  results: number
  podiums: number
  wins: number
  bestRank: number | null
}

export interface SportPassportBadge {
  key: string
  label: string
  description: string
  earned: boolean
}

export function primaryCompetitionRank(ranks: unknown): number | null {
  if (!ranks || typeof ranks !== 'object' || Array.isArray(ranks)) return null
  const entries = Object.entries(ranks as Record<string, unknown>)
  const preferred = entries.find(([key, value]) => key === 'overall' && typeof value === 'number')
  if (preferred) return preferred[1] as number
  const first = entries.find(([, value]) => typeof value === 'number')
  return first ? first[1] as number : null
}

export function primaryCompetitionTime(computed: unknown): number | null {
  if (!computed || typeof computed !== 'object' || Array.isArray(computed)) return null
  const values = computed as Record<string, unknown>
  const preferredKeys = ['best_time_ms', 'time_ms', 'best_ms']
  for (const key of preferredKeys) {
    if (typeof values[key] === 'number') return values[key] as number
  }
  const first = Object.entries(values).find(([key, value]) => key.endsWith('_ms') && typeof value === 'number')
  return first ? first[1] as number : null
}

export function buildSportDisciplineSummaries(entries: SportPassportEntry[]): SportDisciplineSummary[] {
  const summaries = new Map<string, SportDisciplineSummary>()
  for (const entry of entries) {
    if (entry.status !== 'confirmed' || entry.eventStatus !== 'finished') continue
    const eventTypeId = entry.eventTypeId ?? 'other'
    const current = summaries.get(eventTypeId) ?? {
      eventTypeId,
      starts: 0,
      results: 0,
      podiums: 0,
      wins: 0,
      bestRank: null,
    }
    current.starts += 1
    if (entry.hasResult) current.results += 1
    if (entry.rank !== null) {
      current.bestRank = current.bestRank === null ? entry.rank : Math.min(current.bestRank, entry.rank)
      if (entry.rank <= 3) current.podiums += 1
      if (entry.rank === 1) current.wins += 1
    }
    summaries.set(eventTypeId, current)
  }
  return [...summaries.values()].sort((a, b) => b.starts - a.starts || a.eventTypeId.localeCompare(b.eventTypeId))
}

export function buildSportPassportBadges(entries: SportPassportEntry[]): SportPassportBadge[] {
  const finished = entries.filter(entry => entry.status === 'confirmed' && entry.eventStatus === 'finished')
  const results = finished.filter(entry => entry.hasResult)
  const disciplines = new Set(finished.map(entry => entry.eventTypeId ?? 'other'))
  return [
    { key: 'first_start', label: 'Pierwszy start', description: 'Ukończony udział w wydarzeniu', earned: finished.length >= 1 },
    { key: 'five_starts', label: 'Regularny zawodnik', description: 'Co najmniej 5 ukończonych startów', earned: finished.length >= 5 },
    { key: 'first_podium', label: 'Pierwsze podium', description: 'Miejsce w pierwszej trójce', earned: results.some(entry => entry.rank !== null && entry.rank <= 3) },
    { key: 'winner', label: 'Zwycięzca', description: 'Pierwsze miejsce w klasyfikacji', earned: results.some(entry => entry.rank === 1) },
    { key: 'versatile', label: 'Wszechstronny pies', description: 'Starty w co najmniej 3 dyscyplinach', earned: disciplines.size >= 3 },
  ]
}
