import { describe, expect, it } from 'vitest'
import {
  mergeRegistrationUpdate,
  registrationStats,
  splitRegistrationHistory,
} from '@/lib/registrationManagement'

describe('registration management state', () => {
  const registrations = [
    { id: 'reg-1', status: 'confirmed', form_data: { dates: ['2026-08-10'] } },
    { id: 'reg-2', status: 'pending', form_data: {} },
    { id: 'reg-3', status: 'cancelled', form_data: {} },
  ]

  it('updates the registration and all counters immediately after cancellation', () => {
    const updated = mergeRegistrationUpdate(registrations, {
      id: 'reg-1',
      status: 'cancelled',
    })

    expect(updated.find(registration => registration.id === 'reg-1')?.status).toBe('cancelled')
    expect(registrationStats(updated)).toEqual({
      total: 3,
      confirmed: 0,
      pending: 1,
      cancelled: 2,
    })
  })

  it('keeps partially cancelled multidate registrations active', () => {
    const updated = mergeRegistrationUpdate(registrations, {
      id: 'reg-1',
      status: 'confirmed',
      form_data: { dates: ['2026-08-11'] },
    })

    expect(updated[0]).toMatchObject({
      status: 'confirmed',
      form_data: { dates: ['2026-08-11'] },
    })
    expect(registrationStats(updated).confirmed).toBe(1)
  })

  it('separates active registrations from cancellation history', () => {
    const history = splitRegistrationHistory(registrations)

    expect(history.active.map(registration => registration.id)).toEqual(['reg-1', 'reg-2'])
    expect(history.cancelled.map(registration => registration.id)).toEqual(['reg-3'])
  })
})
