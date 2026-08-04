import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrainingBooking, TrainingPayment, TrainingReview, TrainingType } from '@/types'
import { getTrainingCancellationPolicy } from '@/lib/trainingCancellation'

type QueryClient = Pick<SupabaseClient, 'from'>
type TrainingBookingDog = NonNullable<TrainingBooking['dogs']>

export type TrainingBookingWithRelations = Omit<
  TrainingBooking,
  'training_types' | 'training_payments' | 'training_reviews' | 'dogs'
> & {
  training_types?: TrainingType
  training_payments?: TrainingPayment[]
  training_reviews?: TrainingReview[]
  dogs?: TrainingBookingDog
}

interface HydrateTrainingBookingsOptions {
  dogsClient?: QueryClient
  paymentsClient?: QueryClient
  reviewsClient?: QueryClient
  profilesClient?: QueryClient
}

export function mergeTrainingBookingRelations(
  bookings: TrainingBookingWithRelations[],
  trainingTypes: TrainingType[],
  dogs: TrainingBookingDog[],
  payments: TrainingPayment[] = [],
  reviews: TrainingReview[] = [],
  cancellationBufferByTrainerId: Map<string, number> = new Map(),
): TrainingBookingWithRelations[] {
  const trainingTypeById = new Map(trainingTypes.map(trainingType => [trainingType.id, trainingType]))
  const dogById = new Map(dogs.map(dog => [dog.id, dog]))
  const paymentsByBookingId = new Map<string, TrainingPayment[]>()
  for (const payment of payments) {
    const bookingPayments = paymentsByBookingId.get(payment.booking_id) ?? []
    bookingPayments.push(payment)
    paymentsByBookingId.set(payment.booking_id, bookingPayments)
  }
  const reviewsByBookingId = new Map(reviews.map(review => [review.booking_id, review]))

  return bookings.map(booking => {
    const trainingType = booking.training_types ?? trainingTypeById.get(booking.training_type_id)
    const bufferHours = trainingType
      ? cancellationBufferByTrainerId.get(trainingType.trainer_id)
      : undefined
    const cancellation = getTrainingCancellationPolicy({
      status: booking.status,
      scheduledAt: booking.scheduled_at,
      bufferHours,
    })

    return {
      ...booking,
      training_types: trainingType,
      training_payments: booking.training_payments ?? paymentsByBookingId.get(booking.id) ?? [],
      training_reviews: booking.training_reviews
        ?? (reviewsByBookingId.has(booking.id) ? [reviewsByBookingId.get(booking.id)!] : []),
      dogs: booking.dogs ?? (booking.dog_id ? dogById.get(booking.dog_id) : undefined),
      cancellation_allowed: cancellation.canCancel,
      cancellation_deadline: cancellation.deadline,
      cancellation_buffer_hours: cancellation.bufferHours,
    }
  })
}

export async function hydrateTrainingBookings(
  supabase: QueryClient,
  bookings: TrainingBookingWithRelations[],
  options: HydrateTrainingBookingsOptions = {}
): Promise<TrainingBookingWithRelations[]> {
  if (bookings.length === 0) {
    return []
  }

  const trainingTypeIds = [...new Set(bookings.map(booking => booking.training_type_id))]
  const dogIds = [...new Set(bookings.flatMap(booking => booking.dog_id ? [booking.dog_id] : []))]
  const dogsClient = options.dogsClient ?? supabase
  const paymentsClient = options.paymentsClient ?? supabase
  const reviewsClient = options.reviewsClient ?? supabase
  const profilesClient = options.profilesClient ?? supabase

  let trainingTypes: TrainingType[] = []
  if (trainingTypeIds.length > 0) {
    const { data, error } = await supabase
      .from('training_types')
      .select('id, slug, trainer_id, name, description, price_per_hour, duration_min, is_active, created_at, updated_at')
      .in('id', trainingTypeIds)

    if (error) {
      throw error
    }

    trainingTypes = (data ?? []) as TrainingType[]
  }

  let dogs: TrainingBookingDog[] = []
  if (dogIds.length > 0) {
    const { data, error } = await dogsClient
      .from('dogs')
      .select('id, name')
      .in('id', dogIds)

    if (error) {
      console.warn('[training-bookings] Skipping dog relation hydration:', error)
    } else {
      dogs = (data ?? []) as TrainingBookingDog[]
    }
  }

  const { data: paymentData, error: paymentsError } = await paymentsClient
    .from('training_payments')
    .select('id, booking_id, amount, currency, stripe_session_id, stripe_payment_intent_id, stripe_account_id, status, payment_method_id, created_at, updated_at')
    .in('booking_id', bookings.map(booking => booking.id))

  if (paymentsError) {
    throw paymentsError
  }

  const { data: reviewData, error: reviewsError } = await reviewsClient
    .from('training_reviews')
    .select('id, booking_id, trainer_id, user_id, author_name, rating, comment, is_verified, moderation_status, response_text, response_at, created_at, updated_at')
    .in('booking_id', bookings.map(booking => booking.id))

  if (reviewsError) {
    throw reviewsError
  }

  const trainerIds = [...new Set(trainingTypes.map(trainingType => trainingType.trainer_id))]
  const cancellationBufferByTrainerId = new Map<string, number>()
  if (trainerIds.length > 0) {
    const { data: profileData, error: profilesError } = await profilesClient
      .from('trainer_profiles')
      .select('trainer_id, cancellation_buffer_hours')
      .in('trainer_id', trainerIds)

    if (profilesError) {
      throw profilesError
    }
    for (const profile of profileData ?? []) {
      cancellationBufferByTrainerId.set(
        profile.trainer_id as string,
        Number(profile.cancellation_buffer_hours),
      )
    }
  }

  return mergeTrainingBookingRelations(
    bookings,
    trainingTypes,
    dogs,
    (paymentData ?? []) as TrainingPayment[],
    (reviewData ?? []) as TrainingReview[],
    cancellationBufferByTrainerId,
  )
}
