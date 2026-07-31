import { describe, expect, it } from 'vitest'
import { getTrainingCancellationPolicy } from '@/lib/trainingCancellation'

describe('training cancellation policy', () => {
  it('keeps pending checkouts cancellable regardless of the buffer', () => {
    expect(getTrainingCancellationPolicy({
      status: 'pending',
      scheduledAt: '2026-08-01T10:00:00.000Z',
      bufferHours: 24,
      nowMs: new Date('2026-08-01T09:30:00.000Z').getTime(),
    }).canCancel).toBe(true)
  })

  it('computes the cancellation deadline for confirmed bookings', () => {
    const policy = getTrainingCancellationPolicy({
      status: 'confirmed',
      scheduledAt: '2026-08-02T10:00:00.000Z',
      bufferHours: 24,
      nowMs: new Date('2026-08-01T09:59:00.000Z').getTime(),
    })
    expect(policy.canCancel).toBe(true)
    expect(policy.deadline).toBe('2026-08-01T10:00:00.000Z')
  })
})
