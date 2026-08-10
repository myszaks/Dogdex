import { describe, expect, it } from 'vitest'
import {
  buildSportDisciplineSummaries,
  buildSportPassportBadges,
  primaryCompetitionRank,
  primaryCompetitionTime,
  type SportPassportEntry,
} from '@/lib/dogSportPassport'

describe('dog sport passport', () => {
  it('selects the main calculated rank and time', () => {
    expect(primaryCompetitionRank({ size: 2, overall: 1 })).toBe(1)
    expect(primaryCompetitionRank({ category: 3 })).toBe(3)
    expect(primaryCompetitionTime({ lap_ms: 1400, best_time_ms: 1200 })).toBe(1200)
  })

  it('summarizes only confirmed starts in finished events', () => {
    const entries: SportPassportEntry[] = [
      { eventTypeId: 'agility', status: 'confirmed', eventStatus: 'finished', hasResult: true, rank: 1 },
      { eventTypeId: 'agility', status: 'confirmed', eventStatus: 'finished', hasResult: true, rank: 4 },
      { eventTypeId: 'speedway', status: 'confirmed', eventStatus: 'finished', hasResult: false, rank: null },
      { eventTypeId: 'agility', status: 'pending', eventStatus: 'finished', hasResult: true, rank: 2 },
    ]

    expect(buildSportDisciplineSummaries(entries)).toEqual([
      { eventTypeId: 'agility', starts: 2, results: 2, podiums: 1, wins: 1, bestRank: 1 },
      { eventTypeId: 'speedway', starts: 1, results: 0, podiums: 0, wins: 0, bestRank: null },
    ])
    const badges = buildSportPassportBadges(entries)
    expect(badges.find(badge => badge.key === 'first_start')?.earned).toBe(true)
    expect(badges.find(badge => badge.key === 'winner')?.earned).toBe(true)
    expect(badges.find(badge => badge.key === 'versatile')?.earned).toBe(false)
  })
})
