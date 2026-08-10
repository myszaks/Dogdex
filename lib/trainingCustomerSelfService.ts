export type TrainingPassRequestType = 'freeze' | 'extend'

export type TrainingPassRequestInput = {
  requestType: TrainingPassRequestType
  requestedDays: number | null
  reason: string
}

export function parseTrainingPassRequestInput(body: Record<string, unknown>): TrainingPassRequestInput | null {
  if (body.requestType !== 'freeze' && body.requestType !== 'extend') return null
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 3 || reason.length > 1000) return null
  if (body.requestType === 'freeze') return { requestType: 'freeze', requestedDays: null, reason }
  const requestedDays = Number(body.requestedDays)
  if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 730) return null
  return { requestType: 'extend', requestedDays, reason }
}

export function canChangeEnrollmentDog(input: {
  status: string
  paymentStatus: string
  firstSessionAt: string | null
  now?: Date
}) {
  if (!['pending', 'confirmed', 'waitlisted'].includes(input.status)) return false
  if (['paid', 'refunded'].includes(input.paymentStatus)) return false
  if (!input.firstSessionAt) return true
  const firstSession = new Date(input.firstSessionAt)
  return !Number.isNaN(firstSession.getTime()) && firstSession > (input.now ?? new Date())
}
