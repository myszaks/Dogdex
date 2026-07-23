import { describe, expect, it } from 'vitest'
import { getEventCountdown } from '@/lib/eventCountdown'

describe('getEventCountdown', () => {
  const now = new Date('2026-07-23T10:00:00.000Z')

  it('counts down to a future registration deadline first', () => {
    expect(getEventCountdown({
      registration_deadline: '2026-07-25T09:59:59.000Z',
      start_at: '2026-08-02T10:00:00.000Z',
    }, now)).toEqual({
      days: 2,
      target: 'registration_deadline',
      label: 'Do końca zapisów',
    })
  })

  it('switches to the event start after registration closes', () => {
    expect(getEventCountdown({
      registration_deadline: '2026-07-22T10:00:00.000Z',
      start_at: '2026-07-26T10:00:00.000Z',
    }, now)).toEqual({
      days: 3,
      target: 'event_start',
      label: 'Do wydarzenia',
    })
  })

  it('rounds any started 24-hour period up to a full remaining day', () => {
    expect(getEventCountdown({
      start_at: '2026-07-23T10:01:00.000Z',
    }, now)?.days).toBe(1)
  })

  it('returns no countdown once the event has started', () => {
    expect(getEventCountdown({
      start_at: '2026-07-23T10:00:00.000Z',
    }, now)).toBeNull()
  })

  it('ignores invalid dates', () => {
    expect(getEventCountdown({
      registration_deadline: 'not-a-date',
      start_at: 'also-not-a-date',
    }, now)).toBeNull()
  })
})
