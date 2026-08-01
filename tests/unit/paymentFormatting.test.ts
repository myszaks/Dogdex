import { describe, expect, it } from 'vitest'
import { formatPaymentDateTime } from '@/lib/paymentFormatting'

describe('payment date formatting', () => {
  it('shows training times in Europe/Warsaw instead of UTC', () => {
    expect(formatPaymentDateTime('2026-08-02T12:00:00.000Z')).toContain('14:00')
  })
})
