export const DEFAULT_TRAINING_CANCELLATION_BUFFER_HOURS = 24

interface CancellationPolicyInput {
  status: string
  scheduledAt: string
  bufferHours?: number | null
  nowMs?: number
}

export interface TrainingCancellationPolicy {
  canCancel: boolean
  deadline: string | null
  bufferHours: number
}

export function getTrainingCancellationPolicy({
  status,
  scheduledAt,
  bufferHours,
  nowMs = Date.now(),
}: CancellationPolicyInput): TrainingCancellationPolicy {
  const normalizedBuffer = Number.isInteger(bufferHours) && Number(bufferHours) >= 0
    ? Number(bufferHours)
    : DEFAULT_TRAINING_CANCELLATION_BUFFER_HOURS
  const scheduledMs = new Date(scheduledAt).getTime()
  const deadlineMs = scheduledMs - normalizedBuffer * 60 * 60 * 1000
  const deadline = Number.isFinite(deadlineMs) ? new Date(deadlineMs).toISOString() : null

  if (status === 'pending') {
    return { canCancel: true, deadline, bufferHours: normalizedBuffer }
  }

  return {
    canCancel: status === 'confirmed' && Number.isFinite(deadlineMs) && nowMs <= deadlineMs,
    deadline,
    bufferHours: normalizedBuffer,
  }
}
