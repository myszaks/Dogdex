export interface RefundablePaymentItem {
  id: string
  amount: number
  refundedAmount: number
  occurrenceDate: string | null
}

export function buildEventRefundPlan(input: {
  cancelledDates: string[] | null
  formData: Record<string, unknown>
  multidateFieldIds: string[]
  paymentItems: RefundablePaymentItem[]
}) {
  const dates = input.cancelledDates === null
    ? null
    : [...new Set(input.cancelledDates.filter(date => typeof date === 'string' && date.length > 0))]
  if (dates && dates.length === 0) throw new Error('Wybierz co najmniej jeden termin')
  if (dates && input.paymentItems.every(item => item.occurrenceDate === null)) {
    throw new Error('To wydarzenie ma jedną opłatę za cały zapis. Automatyczny częściowy zwrot za datę nie jest możliwy; anuluj cały zapis.')
  }
  const refundable = input.paymentItems.filter(item => {
    const remaining = Math.round((item.amount - item.refundedAmount) * 100)
    return remaining > 0 && (dates === null || (!!item.occurrenceDate && dates.includes(item.occurrenceDate)))
  })
  if (dates) {
    const matched = new Set(input.paymentItems.map(item => item.occurrenceDate))
    const missing = dates.find(date => !matched.has(date))
    if (missing) throw new Error(`Termin ${missing} nie jest objęty tą płatnością`)
  }
  if (refundable.length === 0) throw new Error('Wybrane terminy nie mają kwoty możliwej do zwrotu')
  const nextFormData: Record<string, unknown> = { ...input.formData }
  if (dates) {
    for (const fieldId of input.multidateFieldIds) {
      const value = input.formData[fieldId]
      if (Array.isArray(value)) nextFormData[fieldId] = value.filter(date => !dates.includes(String(date)))
    }
  }
  const cancelRegistration = dates === null || (
    input.multidateFieldIds.length > 0 && input.multidateFieldIds.every(fieldId => {
      const remaining = nextFormData[fieldId]
      return Array.isArray(remaining) && remaining.length === 0
    })
  )
  const amountInCents = refundable.reduce(
    (sum, item) => sum + Math.round((item.amount - item.refundedAmount) * 100), 0,
  )
  return { dates, refundable, nextFormData, cancelRegistration, amountInCents }
}
