import { describe, expect, it } from 'vitest'
import { optimizeEventDayQueue, parseCheckInCode } from '@/lib/eventDay'

describe('Event Day', () => {
  it('extracts a check-in token from QR payload and manual input', () => {
    expect(parseCheckInCode('DOGDEX-CHECKIN:abc-123')).toBe('abc-123')
    expect(parseCheckInCode('  abc-123  ')).toBe('abc-123')
  })

  it('moves checked-in participants first while preserving their order', () => {
    const result = optimizeEventDayQueue([
      { id: 'a', checked_in: false, order_index: 1 },
      { id: 'b', checked_in: true, order_index: 3 },
      { id: 'c', checked_in: true, order_index: 2 },
    ])
    expect(result.map(row => row.id)).toEqual(['c', 'b', 'a'])
  })
})
