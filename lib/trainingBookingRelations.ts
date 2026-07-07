import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrainingBooking, TrainingType } from '@/types'

type QueryClient = Pick<SupabaseClient, 'from'>
type TrainingBookingDog = NonNullable<TrainingBooking['dogs']>

export type TrainingBookingWithRelations = Omit<TrainingBooking, 'training_types' | 'dogs'> & {
  training_types?: TrainingType
  dogs?: TrainingBookingDog
}

interface HydrateTrainingBookingsOptions {
  dogsClient?: QueryClient
}

export function mergeTrainingBookingRelations(
  bookings: TrainingBookingWithRelations[],
  trainingTypes: TrainingType[],
  dogs: TrainingBookingDog[]
): TrainingBookingWithRelations[] {
  const trainingTypeById = new Map(trainingTypes.map(trainingType => [trainingType.id, trainingType]))
  const dogById = new Map(dogs.map(dog => [dog.id, dog]))

  return bookings.map(booking => ({
    ...booking,
    training_types: booking.training_types ?? trainingTypeById.get(booking.training_type_id),
    dogs: booking.dogs ?? (booking.dog_id ? dogById.get(booking.dog_id) : undefined),
  }))
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

  return mergeTrainingBookingRelations(bookings, trainingTypes, dogs)
}
