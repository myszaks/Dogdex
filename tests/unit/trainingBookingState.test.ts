import { describe, expect, it } from 'vitest'
import { validateBookingTransition } from '@/lib/trainingBookingState'

const base = {
  scheduledAt: '2026-07-24T10:00:00.000Z',
  durationMin: 60,
  nowMs: new Date('2026-07-24T12:00:00.000Z').getTime(),
}

describe('training booking state transitions', () => {
  it('prevents manual confirmation while payment is pending', () => {
    expect(validateBookingTransition({
      ...base,
      currentStatus: 'pending',
      nextStatus: 'confirmed',
      actor: 'trainer',
      paymentStatus: 'pending',
    })).toMatchObject({ allowed: false })
  })

  it('allows confirming a paid or free pending booking', () => {
    expect(validateBookingTransition({
      ...base,
      currentStatus: 'pending',
      nextStatus: 'confirmed',
      actor: 'trainer',
      paymentStatus: 'completed',
    })).toEqual({ allowed: true, noop: false })

    expect(validateBookingTransition({
      ...base,
      currentStatus: 'pending',
      nextStatus: 'confirmed',
      actor: 'trainer',
      paymentStatus: null,
    })).toEqual({ allowed: true, noop: false })
  })

  it('prevents an owner from cancelling a completed payment', () => {
    expect(validateBookingTransition({
      ...base,
      currentStatus: 'confirmed',
      nextStatus: 'cancelled',
      actor: 'owner',
      paymentStatus: 'completed',
    })).toMatchObject({ allowed: false })
  })

  it('prevents completing a training before it ends', () => {
    expect(validateBookingTransition({
      ...base,
      currentStatus: 'confirmed',
      nextStatus: 'completed',
      actor: 'trainer',
      paymentStatus: 'completed',
      nowMs: new Date('2026-07-24T10:30:00.000Z').getTime(),
    })).toMatchObject({ allowed: false })
  })

  it('treats repeating the current state as an idempotent no-op', () => {
    expect(validateBookingTransition({
      ...base,
      currentStatus: 'cancelled',
      nextStatus: 'cancelled',
      actor: 'owner',
      paymentStatus: null,
    })).toEqual({ allowed: true, noop: true })
  })
})
