import { describe, expect, it } from 'vitest'
import {
  effectiveEventStatus,
  getEventRegistrationPhase,
  isEventRegistrationOpen,
  registrationWindowValidationError,
} from '@/lib/eventStatus'

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

  it('keeps registration unavailable before its opening date', () => {
    const event = {
      status: 'upcoming',
      start_at: '2026-07-20T10:00:00.000Z',
      end_at: null,
      registration_opens_at: '2026-07-10T10:00:00.000Z',
      registration_deadline: '2026-07-19T10:00:00.000Z',
    }

    expect(getEventRegistrationPhase(
      event,
      new Date('2026-07-10T09:59:59.000Z'),
    )).toBe('not_started')
    expect(isEventRegistrationOpen(
      event,
      new Date('2026-07-10T09:59:59.000Z'),
    )).toBe(false)
  })

  it('opens registration exactly at its opening date', () => {
    expect(getEventRegistrationPhase({
      status: 'upcoming',
      start_at: '2026-07-20T10:00:00.000Z',
      registration_opens_at: '2026-07-10T10:00:00.000Z',
      registration_deadline: null,
    }, new Date('2026-07-10T10:00:00.000Z'))).toBe('open')
  })

  it('validates the registration window order', () => {
    expect(registrationWindowValidationError({
      start_at: '2026-07-20T10:00:00.000Z',
      registration_opens_at: '2026-07-19T10:00:00.000Z',
      registration_deadline: '2026-07-18T10:00:00.000Z',
    })).toContain('przed końcem')

    expect(registrationWindowValidationError({
      start_at: '2026-07-20T10:00:00.000Z',
      registration_opens_at: '2026-07-20T10:00:00.000Z',
      registration_deadline: null,
    })).toContain('przed rozpoczęciem wydarzenia')
  })
})
