import { describe, expect, it } from 'vitest'
import { validateEventRegistrationWindow } from '@/lib/eventRegistrationWindow'

describe('validateEventRegistrationWindow', () => {
  it('accepts a chronological registration window', () => {
    expect(validateEventRegistrationWindow({
      registrationOpensAt: '2026-08-01T08:00:00.000Z',
      registrationDeadline: '2026-08-09T08:00:00.000Z',
      eventStartsAt: '2026-08-10T08:00:00.000Z',
    })).toBeNull()
  })

  it('rejects opening after the registration deadline', () => {
    expect(validateEventRegistrationWindow({
      registrationOpensAt: '2026-08-09T09:00:00.000Z',
      registrationDeadline: '2026-08-09T08:00:00.000Z',
      eventStartsAt: '2026-08-10T08:00:00.000Z',
    })).toBe('Otwarcie zapisów musi nastąpić przed ich zamknięciem')
  })

  it('rejects closing registration after the event starts', () => {
    expect(validateEventRegistrationWindow({
      registrationOpensAt: null,
      registrationDeadline: '2026-08-10T09:00:00.000Z',
      eventStartsAt: '2026-08-10T08:00:00.000Z',
    })).toBe('Zamknięcie zapisów nie może nastąpić po rozpoczęciu wydarzenia')
  })
})
