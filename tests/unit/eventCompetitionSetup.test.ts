import { describe, expect, it } from 'vitest'
import {
  cloneCompetitionPreset,
  getRecommendedCompetitionPreset,
  isLikelyNonCompetitiveEvent,
} from '@/lib/eventCompetitionSetup'

describe('event competition setup recommendations', () => {
  it('recommends the Speedway scheme for a Speedway event', () => {
    const recommendation = getRecommendedCompetitionPreset('speedway')

    expect(recommendation?.key).toBe('speedway')
    expect(recommendation?.definition.rankings[0].groupBy).toContain('size_class')
  })

  it('does not recommend results for walks and workshops', () => {
    expect(getRecommendedCompetitionPreset('spacer')).toBeNull()
    expect(isLikelyNonCompetitiveEvent('spacer')).toBe(true)
    expect(isLikelyNonCompetitiveEvent('wykłady')).toBe(true)
  })

  it('does not guess a scoring scheme when a discipline has no safe default', () => {
    expect(getRecommendedCompetitionPreset('obedience')).toBeNull()
    expect(getRecommendedCompetitionPreset('dog_show')).toBeNull()
  })

  it('returns an independent preset copy for an event', () => {
    const first = cloneCompetitionPreset('time_trial')
    const second = cloneCompetitionPreset('time_trial')

    first.name = 'Changed for one event'
    expect(second.name).not.toBe(first.name)
  })
})
