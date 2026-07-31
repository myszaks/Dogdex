import { describe, expect, it } from 'vitest'
import { mergeTrainingBookingRelations, type TrainingBookingWithRelations } from '@/lib/trainingBookingRelations'
import type { TrainingType } from '@/types'

describe('trainingBookingRelations helpers', () => {
  it('merges training types and dogs without relying on PostgREST relationships', () => {
    const bookings: TrainingBookingWithRelations[] = [
      {
        id: 'booking-1',
        training_type_id: 'type-1',
        user_id: 'user-1',
        dog_id: 'dog-1',
        scheduled_at: '2026-07-10T10:00:00.000Z',
        duration_min: 60,
        status: 'pending',
        cancellation_reason: null,
        cancellation_requested_by: null,
        cancellation_approved_at: null,
        expires_at: null,
        confirmed_at: null,
      completed_at: null,
      reminder_sent_at: null,
        notes_user: null,
        notes_trainer: null,
        created_at: '2026-07-01T10:00:00.000Z',
        updated_at: '2026-07-01T10:00:00.000Z',
      },
      {
        id: 'booking-2',
        training_type_id: 'type-2',
        user_id: 'user-2',
        dog_id: null,
        scheduled_at: '2026-07-11T12:00:00.000Z',
        duration_min: 45,
        status: 'confirmed',
        cancellation_reason: null,
        cancellation_requested_by: null,
        cancellation_approved_at: null,
        expires_at: null,
        confirmed_at: null,
      completed_at: null,
      reminder_sent_at: null,
        notes_user: 'Bring treats',
        notes_trainer: null,
        created_at: '2026-07-01T11:00:00.000Z',
        updated_at: '2026-07-01T11:00:00.000Z',
      },
    ]

    const trainingTypes: TrainingType[] = [
      {
        id: 'type-1',
        slug: 'agility',
        trainer_id: 'trainer-1',
        name: 'Agility',
        description: null,
        price_per_hour: 120,
        duration_min: 60,
        is_active: true,
        created_at: '2026-06-01T10:00:00.000Z',
        updated_at: '2026-06-01T10:00:00.000Z',
      },
      {
        id: 'type-2',
        slug: 'nosework',
        trainer_id: 'trainer-1',
        name: 'Nosework',
        description: 'Scent training',
        price_per_hour: 90,
        duration_min: 45,
        is_active: true,
        created_at: '2026-06-01T10:00:00.000Z',
        updated_at: '2026-06-01T10:00:00.000Z',
      },
    ]

    const dogs = [
      {
        id: 'dog-1',
        name: 'Luna',
      },
    ]

    const payments = [{
      id: 'payment-1',
      booking_id: 'booking-1',
      amount: 120,
      currency: 'PLN',
      stripe_session_id: 'cs_test',
      stripe_payment_intent_id: null,
      stripe_account_id: 'acct_test',
      status: 'pending' as const,
      payment_method_id: null,
      created_at: '2026-07-01T10:00:00.000Z',
      updated_at: '2026-07-01T10:00:00.000Z',
    }]

    const result = mergeTrainingBookingRelations(bookings, trainingTypes, dogs, payments)

    expect(result[0].training_types?.name).toBe('Agility')
    expect(result[0].dogs?.name).toBe('Luna')
    expect(result[0].training_payments?.[0]).toMatchObject({
      amount: 120,
      status: 'pending',
    })
    expect(result[1].training_types?.name).toBe('Nosework')
    expect(result[1].training_payments).toEqual([])
    expect(result[1].dogs).toBeUndefined()
  })

  it('keeps bookings even when no dog relations are available', () => {
    const bookings: TrainingBookingWithRelations[] = [
      {
        id: 'booking-1',
        training_type_id: 'type-1',
        user_id: 'user-1',
        dog_id: 'dog-missing',
        scheduled_at: '2026-07-10T10:00:00.000Z',
        duration_min: 60,
        status: 'pending',
        cancellation_reason: null,
        cancellation_requested_by: null,
        cancellation_approved_at: null,
        expires_at: null,
        confirmed_at: null,
      completed_at: null,
      reminder_sent_at: null,
        notes_user: null,
        notes_trainer: null,
        created_at: '2026-07-01T10:00:00.000Z',
        updated_at: '2026-07-01T10:00:00.000Z',
      },
    ]

    const trainingTypes: TrainingType[] = [
      {
        id: 'type-1',
        slug: 'agility',
        trainer_id: 'trainer-1',
        name: 'Agility',
        description: null,
        price_per_hour: 120,
        duration_min: 60,
        is_active: true,
        created_at: '2026-06-01T10:00:00.000Z',
        updated_at: '2026-06-01T10:00:00.000Z',
      },
    ]

    const result = mergeTrainingBookingRelations(bookings, trainingTypes, [])

    expect(result).toHaveLength(1)
    expect(result[0].training_types?.name).toBe('Agility')
    expect(result[0].dogs).toBeUndefined()
  })
})
