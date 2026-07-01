import { describe, expect, it } from 'vitest'
import { effectiveEventStatus, isEventRegistrationOpen } from '@/lib/eventStatus'

describe('eventStatus', () => {
  it('returns cancelled for explicitly cancelled events', () => {
    expect(effectiveEventStatus({
      status: 'cancelled',
      start_at: '2026-07-01T10:00:00.000Z',
      end_at: '2026-07-01T12:00:00.000Z',
      registration_deadline: null,
    })).toBe('cancelled')
  })

  it('returns finished after event end', () => {
    expect(effectiveEventStatus({
      status: 'upcoming',
      start_at: '2026-06-01T10:00:00.000Z',
      end_at: '2026-06-01T12:00:00.000Z',
      registration_deadline: null,
    }, new Date('2026-06-01T12:00:01.000Z'))).toBe('finished')
  })

  it('closes registration after deadline even if status was not updated', () => {
    expect(isEventRegistrationOpen({
      status: 'upcoming',
      start_at: '2026-07-10T10:00:00.000Z',
      end_at: null,
      registration_deadline: '2026-07-09T10:00:00.000Z',
    }, new Date('2026-07-09T10:00:01.000Z'))).toBe(false)
  })

  it('closes registration once the event is already ongoing', () => {
    expect(isEventRegistrationOpen({
      status: 'upcoming',
      start_at: '2026-07-10T10:00:00.000Z',
      end_at: null,
      registration_deadline: null,
    }, new Date('2026-07-10T10:00:00.000Z'))).toBe(false)
  })
})
