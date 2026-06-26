import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'

export async function GET() {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const supabase = await createAuthClient()

  // Get all training types for this trainer
  const { data: types } = await supabase
    .from('training_types')
    .select('id')
    .eq('trainer_id', user.id)

  if (!types || types.length === 0) {
    return NextResponse.json([])
  }

  const typeIds = types.map(t => t.id)

  // Get bookings for trainer's training types with dog info
  const { data, error } = await supabase
    .from('training_bookings')
    .select(`
      *,
      training_types(id, trainer_id, name, price_per_hour),
      dogs(id, name)
    `)
    .in('training_type_id', typeIds)
    .order('scheduled_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch user full names server-side for each booking
  const bookingsWithUsers = await Promise.all(
    data.map(async (booking: any) => {
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(booking.user_id)
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', booking.user_id)
        .single()

      return {
        ...booking,
        user_name: profile?.full_name || authUser?.email || 'Użytkownik',
      }
    })
  )

  return NextResponse.json(bookingsWithUsers)
}
