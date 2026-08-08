import { describe, expect, it } from 'vitest'
import { validateEventSchedule } from '@/lib/eventSchedule'

describe('validateEventSchedule', () => {
  it('requires an end date for an active event', () => {
    expect(validateEventSchedule({
      status: 'upcoming',
      startAt: '2026-08-10T08:00:00.000Z',
      endAt: null,
    })).toBe('Data zakończenia wydarzenia jest wymagana')
  })

  it('allows an incomplete draft schedule', () => {
    expect(validateEventSchedule({
      status: 'draft',
      startAt: null,
      endAt: null,
    })).toBeNull()
  })

  it('allows a legacy terminal event without an end date', () => {
    expect(validateEventSchedule({
      status: 'finished',
      startAt: '2026-08-10T08:00:00.000Z',
      endAt: null,
    })).toBeNull()
  })

  it('requires the end date to be later than the start date', () => {
    expect(validateEventSchedule({
      status: 'upcoming',
      startAt: '2026-08-10T08:00:00.000Z',
      endAt: '2026-08-10T08:00:00.000Z',
    })).toBe('Data zakończenia wydarzenia musi przypadać po dacie rozpoczęcia')
  })
})
