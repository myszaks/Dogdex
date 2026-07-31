import { describe, expect, it } from 'vitest'
import { buildEventRefundPlan } from '@/lib/eventRefundPlanning'

const items = [
  { id: 'one', amount: 40, refundedAmount: 0, occurrenceDate: '2030-08-01' },
  { id: 'two', amount: 55, refundedAmount: 0, occurrenceDate: '2030-08-08' },
]

describe('event refund planning', () => {
  it('allocates a partial refund to one date and preserves the remaining date', () => {
    const plan = buildEventRefundPlan({ cancelledDates: ['2030-08-01'], formData: { dates: ['2030-08-01', '2030-08-08'] }, multidateFieldIds: ['dates'], paymentItems: items })
    expect(plan.amountInCents).toBe(4000)
    expect(plan.refundable.map(item => item.id)).toEqual(['one'])
    expect(plan.nextFormData).toEqual({ dates: ['2030-08-08'] })
    expect(plan.cancelRegistration).toBe(false)
  })

  it('refunds every remaining allocation for full cancellation', () => {
    const plan = buildEventRefundPlan({ cancelledDates: null, formData: { dates: ['2030-08-01', '2030-08-08'] }, multidateFieldIds: ['dates'], paymentItems: [{ ...items[0], refundedAmount: 10 }, items[1]] })
    expect(plan.amountInCents).toBe(8500)
    expect(plan.cancelRegistration).toBe(true)
  })

  it('rejects a date not included in the payment', () => {
    expect(() => buildEventRefundPlan({ cancelledDates: ['2030-08-15'], formData: { dates: ['2030-08-01'] }, multidateFieldIds: ['dates'], paymentItems: items })).toThrow('nie jest objęty')
  })

  it('deduplicates dates so the amount cannot be refunded twice', () => {
    const plan = buildEventRefundPlan({ cancelledDates: ['2030-08-01', '2030-08-01'], formData: { dates: ['2030-08-01'] }, multidateFieldIds: ['dates'], paymentItems: items })
    expect(plan.amountInCents).toBe(4000)
  })

  it('does not invent a date-level refund for one flat entry fee', () => {
    expect(() => buildEventRefundPlan({ cancelledDates: ['2030-08-01'], formData: { dates: ['2030-08-01'] }, multidateFieldIds: ['dates'], paymentItems: [{ id: 'entry', amount: 100, refundedAmount: 0, occurrenceDate: null }] })).toThrow('jedną opłatę')
  })
})
