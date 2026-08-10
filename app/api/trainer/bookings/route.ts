import { NextResponse } from 'next/server'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'
import { createServerClient } from '@/lib/supabaseServer'
import { hydrateTrainingBookings } from '@/lib/trainingBookingRelations'

export async function GET() {
  const result = await requireBusinessProfileAccessForApi(null, ['trainings.bookings', 'customers.view'])
  if ('error' in result) return result.error
  const db = createServerClient()
  const { data, error } = await db.from('training_bookings')
    .select('*')
    .eq('business_profile_id', result.access.profile.id)
    .order('scheduled_at', { ascending: false })
  if (error) {
    console.error('[trainer-bookings][GET] Failed to load bookings:', error)
    return NextResponse.json({ error: 'Nie udało się pobrać rezerwacji' }, { status: 500 })
  }
  let bookings
  try {
    bookings = await hydrateTrainingBookings(db, data ?? [], { dogsClient: db, paymentsClient: db })
  } catch (relationsError) {
    console.error('[trainer-bookings][GET] Failed to hydrate relations:', relationsError)
    return NextResponse.json({ error: 'Nie udało się pobrać rezerwacji' }, { status: 500 })
  }
  const userIds = [...new Set(bookings.map(booking => booking.user_id))]
  let userNameById = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await db.from('profiles').select('id, full_name').in('id', userIds)
    if (profilesError) console.error('[trainer-bookings][GET] Failed to load profiles:', profilesError)
    else userNameById = new Map((profiles ?? []).filter(profile => typeof profile.id === 'string').map(profile => [
      profile.id as string,
      typeof profile.full_name === 'string' && profile.full_name.trim() ? profile.full_name : 'Użytkownik',
    ]))
  }
  return NextResponse.json(bookings.map(booking => ({
    ...booking,
    user_name: userNameById.get(booking.user_id) ?? 'Użytkownik',
  })))
}
