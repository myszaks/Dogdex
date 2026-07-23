import { describe, expect, it } from 'vitest'
import { getEventCountdown } from '@/lib/eventCountdown'

describe('getEventCountdown', () => {
  const now = new Date('2026-07-23T10:00:00.000Z')

  it('counts down to a future registration deadline first', () => {
    expect(getEventCountdown({
      status: 'upcoming',
      registrationPhase: 'open',
      registrationAvailable: true,
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
      status: 'upcoming',
      registrationPhase: 'closed',
      registrationAvailable: false,
      registration_deadline: '2026-07-22T10:00:00.000Z',
      start_at: '2026-07-26T10:00:00.000Z',
    }, now)).toEqual({
      days: 3,
      target: 'event_start',
      label: 'Do wydarzenia',
    })
  })

  it('counts down to the beginning of registration before it opens', () => {
    expect(getEventCountdown({
      status: 'upcoming',
      registrationPhase: 'not_started',
      registrationAvailable: false,
      registration_opens_at: '2026-07-25T09:59:59.000Z',
      registration_deadline: '2026-07-30T10:00:00.000Z',
      start_at: '2026-08-02T10:00:00.000Z',
    }, now)).toEqual({
      days: 2,
      target: 'registration_opening',
      label: 'Do początku zapisów',
    })
  })

  it('counts down to the event when registration is full', () => {
    expect(getEventCountdown({
      status: 'upcoming',
      registrationPhase: 'open',
      registrationAvailable: false,
      registration_deadline: '2026-07-25T10:00:00.000Z',
      start_at: '2026-08-02T10:00:00.000Z',
    }, now)).toEqual({
      days: 10,
      target: 'event_start',
      label: 'Do wydarzenia',
    })
  })

  it('counts down to the end of an ongoing event', () => {
    expect(getEventCountdown({
      status: 'ongoing',
      registrationPhase: 'closed',
      registrationAvailable: false,
      start_at: '2026-07-23T09:00:00.000Z',
      end_at: '2026-07-25T09:00:00.000Z',
    }, now)).toEqual({
      days: 2,
      target: 'event_end',
      label: 'Do końca wydarzenia',
    })
  })

  it('rounds any started 24-hour period up to a full remaining day', () => {
    expect(getEventCountdown({
      status: 'upcoming',
      registrationPhase: 'open',
      registrationAvailable: true,
      start_at: '2026-07-23T10:01:00.000Z',
    }, now)?.days).toBe(1)
  })

  it('returns no countdown once the event has started', () => {
    expect(getEventCountdown({
      status: 'upcoming',
      registrationPhase: 'closed',
      registrationAvailable: false,
      start_at: '2026-07-23T10:00:00.000Z',
    }, now)).toBeNull()
  })

  it('ignores invalid dates', () => {
    expect(getEventCountdown({
      status: 'upcoming',
      registrationPhase: 'open',
      registrationAvailable: true,
      registration_deadline: 'not-a-date',
      start_at: 'also-not-a-date',
    }, now)).toBeNull()
  })

  it.each(['finished', 'cancelled'] as const)(
    'returns no countdown for a %s event',
    status => {
      expect(getEventCountdown({
        status,
        registrationPhase: 'closed',
        registrationAvailable: false,
        start_at: '2026-08-02T10:00:00.000Z',
        end_at: '2026-08-03T10:00:00.000Z',
      }, now)).toBeNull()
    }
  )
})
