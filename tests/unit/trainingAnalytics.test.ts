import { describe, expect, it } from 'vitest'
import { buildTrainingAnalytics } from '@/lib/trainingAnalytics'
import type { TrainingBooking, TrainingPayment, TrainingReview } from '@/types'

function booking(id: string, status: TrainingBooking['status'], scheduledAt: string): TrainingBooking {
  return {
    id,
    training_type_id: 'type-1',
    user_id: 'user-1',
    dog_id: null,
    scheduled_at: scheduledAt,
    duration_min: 60,
    status,
    cancellation_reason: null,
    cancellation_requested_by: null,
    cancellation_approved_at: null,
    expires_at: null,
    confirmed_at: null,
    completed_at: null,
    reminder_sent_at: null,
    notes_user: null,
    notes_trainer: null,
    created_at: scheduledAt,
    updated_at: scheduledAt,
  }
}

describe('training analytics', () => {
  it('calculates completed revenue, refunds and ratings', () => {
    const bookings = [
      booking('completed', 'completed', '2026-07-10T10:00:00.000Z'),
      booking('cancelled', 'cancelled', '2026-07-11T10:00:00.000Z'),
      booking('upcoming', 'confirmed', '2026-08-10T10:00:00.000Z'),
    ]
    const payments = [
      { booking_id: 'completed', amount: 120, currency: 'PLN', status: 'completed' },
      { booking_id: 'cancelled', amount: 80, currency: 'PLN', status: 'refunded' },
    ] as TrainingPayment[]
    const reviews = [{ rating: 4 }, { rating: 5 }] as TrainingReview[]

    const result = buildTrainingAnalytics(
      bookings,
      payments,
      reviews,
      new Date('2026-07-31T12:00:00.000Z'),
    )

    expect(result.summary).toMatchObject({
      totalBookings: 3,
      upcomingBookings: 1,
      completedBookings: 1,
      cancelledBookings: 1,
      completionRate: 50,
      revenue: 120,
      refunded: 80,
      averageRating: 4.5,
      reviewCount: 2,
    })
  })
})
