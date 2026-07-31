import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { isTrainerRole } from '@/lib/roles'
import { createAuthClient } from '@/lib/supabaseServer'
import {
  buildTrainingAnalytics,
  getTrainingAnalyticsStart,
  type TrainingAnalyticsRange,
} from '@/lib/trainingAnalytics'
import type { TrainingBooking, TrainingPayment, TrainingReview } from '@/types'

const VALID_RANGES = new Set<TrainingAnalyticsRange>(['30d', '90d', '365d', 'all'])

export async function GET(req: Request) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!isTrainerRole(role)) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const requestedRange = new URL(req.url).searchParams.get('range') ?? '90d'
  if (!VALID_RANGES.has(requestedRange as TrainingAnalyticsRange)) {
    return NextResponse.json({ error: 'Nieprawidłowy zakres' }, { status: 400 })
  }
  const range = requestedRange as TrainingAnalyticsRange
  const start = getTrainingAnalyticsStart(range)
  const supabase = await createAuthClient()

  const { data: types, error: typesError } = await supabase
    .from('training_types')
    .select('id')
    .eq('trainer_id', user.id)
  if (typesError) {
    return NextResponse.json({ error: 'Nie udało się pobrać analityki' }, { status: 500 })
  }

  const typeIds = (types ?? []).map(type => type.id)
  let bookings: TrainingBooking[] = []
  if (typeIds.length > 0) {
    let bookingsQuery = supabase
      .from('training_bookings')
      .select('*')
      .in('training_type_id', typeIds)
      .order('scheduled_at', { ascending: true })
    if (start) bookingsQuery = bookingsQuery.gte('scheduled_at', start.toISOString())
    const { data, error } = await bookingsQuery
    if (error) {
      return NextResponse.json({ error: 'Nie udało się pobrać rezerwacji' }, { status: 500 })
    }
    bookings = (data ?? []) as TrainingBooking[]
  }

  let payments: TrainingPayment[] = []
  if (bookings.length > 0) {
    const { data, error } = await supabase
      .from('training_payments')
      .select('*')
      .in('booking_id', bookings.map(booking => booking.id))
    if (error) {
      return NextResponse.json({ error: 'Nie udało się pobrać płatności' }, { status: 500 })
    }
    payments = (data ?? []) as TrainingPayment[]
  }

  let reviewsQuery = supabase
    .from('training_reviews')
    .select('*')
    .eq('trainer_id', user.id)
  if (start) reviewsQuery = reviewsQuery.gte('created_at', start.toISOString())
  const { data: reviews, error: reviewsError } = await reviewsQuery
  if (reviewsError) {
    return NextResponse.json({ error: 'Nie udało się pobrać opinii' }, { status: 500 })
  }

  return NextResponse.json({
    range,
    ...buildTrainingAnalytics(bookings, payments, (reviews ?? []) as TrainingReview[]),
  })
}
