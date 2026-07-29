import { describe, expect, it } from 'vitest'
import {
  isValidTrainingDate,
  isValidTrainingTime,
  isValidTrainingTimeRange,
} from '@/lib/trainingAvailability'

describe('training availability validation', () => {
  it('accepts valid calendar dates and rejects normalized overflow dates', () => {
    expect(isValidTrainingDate('2026-02-28')).toBe(true)
    expect(isValidTrainingDate('2026-02-30')).toBe(false)
    expect(isValidTrainingDate('26-02-28')).toBe(false)
  })

  it('accepts 24-hour times only', () => {
    expect(isValidTrainingTime('09:30')).toBe(true)
    expect(isValidTrainingTime('23:59:59')).toBe(true)
    expect(isValidTrainingTime('24:00')).toBe(false)
    expect(isValidTrainingTime('9:30')).toBe(false)
  })

  it('requires the end of a range to be after its start', () => {
    expect(isValidTrainingTimeRange('09:00', '10:00')).toBe(true)
    expect(isValidTrainingTimeRange('10:00', '10:00')).toBe(false)
    expect(isValidTrainingTimeRange('11:00', '10:00')).toBe(false)
  })
})
