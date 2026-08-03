import { describe, expect, it } from 'vitest'
import {
  effectiveEventStatus,
  eventLiveState,
  isEventRegistrationOpen,
} from '@/lib/eventStatus'

describe('eventStatus', () => {
  it('keeps draft events as draft and closed for registration', () => {
    const event = {
      status: 'draft',
      start_at: '2026-07-01T10:00:00.000Z',
      end_at: null,
      registration_deadline: null,
    }

    expect(effectiveEventStatus(event, new Date('2026-06-01T10:00:00.000Z'))).toBe('draft')
    expect(isEventRegistrationOpen(event, new Date('2026-06-01T10:00:00.000Z'))).toBe(false)
  })

  it('returns cancelled for explicitly cancelled events', () => {
    expect(effectiveEventStatus({
      status: 'cancelled',
      start_at: '2026-07-01T10:00:00.000Z',
      end_at: '2026-07-01T12:00:00.000Z',
      registration_deadline: null,
    })).toBe('cancelled')
  })

  it('returns finished for explicitly finished events even before end time', () => {
    expect(effectiveEventStatus({
      status: 'finished',
      start_at: '2026-07-01T10:00:00.000Z',
      end_at: '2026-07-01T18:00:00.000Z',
      registration_deadline: null,
    }, new Date('2026-07-01T12:00:00.000Z'))).toBe('finished')
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

  it('keeps registration closed until the configured opening time', () => {
    const event = {
      status: 'upcoming',
      start_at: '2026-08-10T10:00:00.000Z',
      end_at: null,
      registration_opens_at: '2026-08-05T10:00:00.000Z',
      registration_deadline: '2026-08-09T10:00:00.000Z',
    }

    expect(isEventRegistrationOpen(event, new Date('2026-08-05T09:59:59.000Z'))).toBe(false)
    expect(isEventRegistrationOpen(event, new Date('2026-08-05T10:00:00.000Z'))).toBe(true)
  })

  it('closes registration once the event is already ongoing', () => {
    expect(isEventRegistrationOpen({
      status: 'upcoming',
      start_at: '2026-07-10T10:00:00.000Z',
      end_at: null,
      registration_deadline: null,
    }, new Date('2026-07-10T10:00:00.000Z'))).toBe(false)
  })

  it('does not expose the live view before a scheduled event starts', () => {
    expect(eventLiveState({
      status: 'upcoming',
      start_at: '2026-08-15T10:00:00.000Z',
      end_at: '2026-08-15T12:00:00.000Z',
      registration_deadline: null,
    }, new Date('2026-07-30T10:00:00.000Z'))).toBe('upcoming')
  })

  it('allows an organizer to start live manually before the scheduled time', () => {
    expect(eventLiveState({
      status: 'ongoing',
      start_at: '2026-08-15T10:00:00.000Z',
      end_at: '2026-08-15T12:00:00.000Z',
      registration_deadline: null,
    }, new Date('2026-07-30T10:00:00.000Z'))).toBe('live')
  })

  it('does not keep live open after the event end time', () => {
    expect(eventLiveState({
      status: 'ongoing',
      start_at: '2026-07-30T08:00:00.000Z',
      end_at: '2026-07-30T10:00:00.000Z',
      registration_deadline: null,
    }, new Date('2026-07-30T10:00:01.000Z'))).toBe('finished')
  })
})
