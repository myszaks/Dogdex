import { describe, expect, it } from 'vitest'
import { canChangeEnrollmentDog, parseTrainingPassRequestInput } from '@/lib/trainingCustomerSelfService'

describe('training customer self-service', () => {
  it('normalizes a trainer-approved freeze request without granting days', () => {
    expect(parseTrainingPassRequestInput({ requestType: 'freeze', requestedDays: 120, reason: 'Kontuzja psa' })).toEqual({
      requestType: 'freeze', requestedDays: null, reason: 'Kontuzja psa',
    })
  })

  it('validates extension duration and justification', () => {
    expect(parseTrainingPassRequestInput({ requestType: 'extend', requestedDays: 30, reason: 'Przerwa zdrowotna' })).toEqual({
      requestType: 'extend', requestedDays: 30, reason: 'Przerwa zdrowotna',
    })
    expect(parseTrainingPassRequestInput({ requestType: 'extend', requestedDays: 0, reason: 'Przerwa zdrowotna' })).toBeNull()
    expect(parseTrainingPassRequestInput({ requestType: 'extend', requestedDays: 30, reason: 'x' })).toBeNull()
  })

  it('allows changing the dog only before payment and course start', () => {
    const now = new Date('2030-01-01T12:00:00.000Z')
    expect(canChangeEnrollmentDog({ status: 'pending', paymentStatus: 'unpaid', firstSessionAt: '2030-01-02T12:00:00.000Z', now })).toBe(true)
    expect(canChangeEnrollmentDog({ status: 'confirmed', paymentStatus: 'paid', firstSessionAt: '2030-01-02T12:00:00.000Z', now })).toBe(false)
    expect(canChangeEnrollmentDog({ status: 'pending', paymentStatus: 'unpaid', firstSessionAt: '2029-12-31T12:00:00.000Z', now })).toBe(false)
    expect(canChangeEnrollmentDog({ status: 'cancelled', paymentStatus: 'unpaid', firstSessionAt: null, now })).toBe(false)
  })
})
