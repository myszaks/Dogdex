import { describe, expect, it } from 'vitest'
import { formatEmailDate, formatEmailDateTime } from '@/lib/emailDate'

describe('email date formatting', () => {
  it('formats event datetimes in Europe/Warsaw time', () => {
    expect(formatEmailDateTime('2026-07-10T08:00:00.000Z')).toContain('10:00')
  })

  it('keeps date-only values on the selected calendar day', () => {
    expect(formatEmailDate('2026-07-10')).toContain('10 lipca 2026')
  })
})
