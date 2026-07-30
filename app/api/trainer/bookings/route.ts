import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { isTrainerRole } from '@/lib/roles'
import { createAuthClient, createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { hydrateTrainingBookings } from '@/lib/trainingBookingRelations'

export async function GET() {
  const { user, role } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Brak uprawnien' }, { status: 401 })
  }
  if (!isTrainerRole(role)) {
    return NextResponse.json({ error: 'Brak uprawnien' }, { status: 403 })
  }

  const supabase = await createAuthClient()
  const privilegedClient = hasServiceRoleKey() ? createServerClient() : null

  const { data: types, error: typesError } = await supabase
    .from('training_types')
    .select('id')
    .eq('trainer_id', user.id)

  if (typesError) {
    console.error('[trainer-bookings][GET] Failed to load training types:', typesError)
    return NextResponse.json({ error: 'Nie udało się pobrać rezerwacji' }, { status: 500 })
  }

  if (!types || types.length === 0) {
    return NextResponse.json([])
  }

  const typeIds = types.map(type => type.id)

  const { data, error } = await supabase
    .from('training_bookings')
    .select('*')
    .in('training_type_id', typeIds)
    .order('scheduled_at', { ascending: false })

  if (error) {
    console.error('[trainer-bookings][GET] Failed to load bookings:', error)
    return NextResponse.json({ error: 'Nie udało się pobrać rezerwacji' }, { status: 500 })
  }

  let bookings
  try {
    bookings = await hydrateTrainingBookings(supabase, data ?? [], {
      dogsClient: supabase,
    })
  } catch (relationsError) {
    console.error('[trainer-bookings][GET] Failed to hydrate relations:', relationsError)
    return NextResponse.json({ error: 'Nie udało się pobrać rezerwacji' }, { status: 500 })
  }

  const userIds = [...new Set(bookings.map(booking => booking.user_id))]
  let userNameById = new Map<string, string>()

  if (userIds.length > 0 && privilegedClient) {
    const { data: profiles, error: profilesError } = await privilegedClient
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)

    if (profilesError) {
      console.error('[trainer-bookings][GET] Failed to load profiles:', profilesError)
    } else {
      userNameById = new Map(
        (profiles ?? [])
          .filter(profile => typeof profile.id === 'string')
          .map(profile => [
            profile.id as string,
            typeof profile.full_name === 'string' && profile.full_name.trim().length > 0
              ? profile.full_name
              : 'Użytkownik',
          ])
      )
    }
  }

  return NextResponse.json(
    bookings.map(booking => ({
      ...booking,
      user_name: userNameById.get(booking.user_id) ?? 'Użytkownik',
    }))
  )
}
