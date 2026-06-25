import { describe, expect, it } from 'vitest'
import { getIsoDateInTimeZone, hasMultidateSelection, shouldSendMultidateReminder } from '@/lib/reminders'

describe('reminders helpers', () => {
  it('formats reminder date in Europe/Warsaw timezone', () => {
    expect(getIsoDateInTimeZone(new Date('2026-06-25T22:30:00.000Z'))).toBe('2026-06-26')
  })

  it('detects multidate selections in form data', () => {
    expect(hasMultidateSelection({ dates: ['2026-06-26', '2026-06-27'] })).toBe(true)
    expect(hasMultidateSelection({ notes: ['abc', 'def'] })).toBe(false)
  })

  it('does not send multidate reminders for non-upcoming events', () => {
    expect(shouldSendMultidateReminder({
      status: 'cancelled',
      start_at: '2026-07-01T10:00:00.000Z',
      end_at: null,
    })).toBe(false)

    expect(shouldSendMultidateReminder({
      status: 'upcoming',
      start_at: '2026-06-01T10:00:00.000Z',
      end_at: null,
    })).toBe(false)
  })
})
