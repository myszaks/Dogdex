import { NextResponse } from 'next/server'
import { addMinutes } from 'date-fns'
import { buildGoogleCalendarUrl } from '@/lib/googleCalendar'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'

interface Params { params: Promise<{ id: string }> }
function one<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value }

export async function GET(req: Request, { params }: Params) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Zaloguj się, aby dodać termin' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji kalendarza' }, { status: 503 })
  const { id } = await params
  const supabase = createServerClient()
  const { data: booking } = await supabase.from('training_bookings')
    .select('id, user_id, scheduled_at, duration_min, status, notes_user, training_types(name, trainer_id)')
    .eq('id', id).maybeSingle()
  const type = one(booking?.training_types ?? null)
  if (!booking || !type || (booking.user_id !== user.id && type.trainer_id !== user.id && role !== 'admin')) {
    return NextResponse.json({ error: 'Nie znaleziono rezerwacji' }, { status: 404 })
  }
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'Anulowanego treningu nie można dodać' }, { status: 409 })
  const { data: profile } = await supabase.from('trainer_profiles')
    .select('full_name, location_city, location_details').eq('trainer_id', type.trainer_id).maybeSingle()
  const start = new Date(booking.scheduled_at)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
  return NextResponse.redirect(buildGoogleCalendarUrl({
    title: `${type.name}${profile?.full_name ? ` – ${profile.full_name}` : ''}`,
    start,
    end: addMinutes(start, booking.duration_min),
    description: [booking.notes_user ? `Notatki: ${booking.notes_user}` : null, `${baseUrl}/moje-zapisy`].filter(Boolean).join('\n\n'),
    location: [profile?.location_city, profile?.location_details].filter(Boolean).join(', '),
  }), 302)
}
