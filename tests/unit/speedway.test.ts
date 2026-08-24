import { describe, expect, it } from 'vitest'
import { bestMs, computeSpeedKmh, formatRunTime, parseRunMs, placementLabel } from '@/lib/speedway'

describe('speedway helpers', () => {
  it('returns zero speed for invalid input values', () => {
    expect(computeSpeedKmh(0, 100)).toBe(0)
    expect(computeSpeedKmh(5000, 0)).toBe(0)
  })

  it('parses run time with comma separator', () => {
    expect(parseRunMs('4,57')).toBe(4570)
  })

  it('returns the best run time and formats invalid values safely', () => {
    expect(bestMs(5100, 4900)).toBe(4900)
    expect(formatRunTime(0)).toBe('—')
  })

  it('does not award a medal to an unclassified DNS/DNF result', () => {
    expect(placementLabel(null)).toBe('—')
    expect(placementLabel(1)).toBe('🥇')
  })
})
