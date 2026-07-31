import type { TrainingBooking, TrainingPayment, TrainingReview } from '@/types'

export type TrainingAnalyticsRange = '30d' | '90d' | '365d' | 'all'

export interface TrainingAnalyticsSummary {
  totalBookings: number
  upcomingBookings: number
  completedBookings: number
  cancelledBookings: number
  completionRate: number
  revenue: number
  refunded: number
  currency: string
  averageRating: number | null
  reviewCount: number
}

export interface TrainingAnalyticsMonth {
  month: string
  bookings: number
  completed: number
  revenue: number
}

export interface TrainingAnalyticsResult {
  summary: TrainingAnalyticsSummary
  months: TrainingAnalyticsMonth[]
}

export function getTrainingAnalyticsStart(range: TrainingAnalyticsRange, now = new Date()) {
  if (range === 'all') return null
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export function buildTrainingAnalytics(
  bookings: TrainingBooking[],
  payments: TrainingPayment[],
  reviews: TrainingReview[],
  now = new Date(),
): TrainingAnalyticsResult {
  const paymentByBooking = new Map(payments.map(payment => [payment.booking_id, payment]))
  const completedBookings = bookings.filter(booking => booking.status === 'completed')
  const cancelledBookings = bookings.filter(booking => booking.status === 'cancelled')
  const settledBookings = completedBookings.length + cancelledBookings.length
  const revenue = completedBookings.reduce((sum, booking) => {
    const payment = paymentByBooking.get(booking.id)
    return sum + (payment?.status === 'completed' ? Number(payment.amount) : 0)
  }, 0)
  const refunded = payments.reduce(
    (sum, payment) => sum + (payment.status === 'refunded' ? Number(payment.amount) : 0),
    0,
  )
  const ratingSum = reviews.reduce((sum, review) => sum + review.rating, 0)

  const monthMap = new Map<string, TrainingAnalyticsMonth>()
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    const month = date.toISOString().slice(0, 7)
    monthMap.set(month, { month, bookings: 0, completed: 0, revenue: 0 })
  }

  for (const booking of bookings) {
    const month = booking.scheduled_at.slice(0, 7)
    const bucket = monthMap.get(month)
    if (!bucket) continue
    bucket.bookings += 1
    if (booking.status === 'completed') {
      bucket.completed += 1
      const payment = paymentByBooking.get(booking.id)
      if (payment?.status === 'completed') bucket.revenue += Number(payment.amount)
    }
  }

  return {
    summary: {
      totalBookings: bookings.length,
      upcomingBookings: bookings.filter(
        booking => ['pending', 'confirmed'].includes(booking.status)
          && new Date(booking.scheduled_at).getTime() > now.getTime(),
      ).length,
      completedBookings: completedBookings.length,
      cancelledBookings: cancelledBookings.length,
      completionRate: settledBookings > 0
        ? Math.round((completedBookings.length / settledBookings) * 100)
        : 0,
      revenue,
      refunded,
      currency: payments[0]?.currency ?? 'PLN',
      averageRating: reviews.length > 0
        ? Math.round((ratingSum / reviews.length) * 10) / 10
        : null,
      reviewCount: reviews.length,
    },
    months: [...monthMap.values()],
  }
}
