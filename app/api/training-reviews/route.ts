import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createAuthClient, createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'

function validateReviewInput(body: Record<string, unknown>) {
  const rating = Number(body.rating)
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: 'Ocena musi być liczbą od 1 do 5' } as const
  }
  if (comment.length > 2000) {
    return { error: 'Opinia może mieć maksymalnie 2000 znaków' } as const
  }
  return { rating, comment: comment || null } as const
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export async function GET(req: Request) {
  const trainerId = new URL(req.url).searchParams.get('trainer_id')
  if (!trainerId) {
    return NextResponse.json({ error: 'Brakuje identyfikatora trenera' }, { status: 400 })
  }

  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('training_reviews')
    .select('id, booking_id, trainer_id, author_name, rating, comment, created_at, updated_at')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: 'Nie udało się pobrać opinii' }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera opinii' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }
  if (typeof body.booking_id !== 'string' || !body.booking_id) {
    return NextResponse.json({ error: 'Brakuje identyfikatora rezerwacji' }, { status: 400 })
  }
  const validated = validateReviewInput(body)
  if ('error' in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: booking, error: bookingError } = await supabase
    .from('training_bookings')
    .select('id, user_id, status, training_types(trainer_id)')
    .eq('id', body.booking_id)
    .maybeSingle()

  if (bookingError) {
    return NextResponse.json({ error: 'Nie udało się sprawdzić rezerwacji' }, { status: 500 })
  }
  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: 'Nie znaleziono rezerwacji' }, { status: 404 })
  }
  if (booking.status !== 'completed') {
    return NextResponse.json({ error: 'Opinię można dodać dopiero po zakończonym treningu' }, { status: 409 })
  }

  const trainerId = firstRelation(booking.training_types)?.trainer_id
  if (!trainerId) {
    return NextResponse.json({ error: 'Nie znaleziono trenera' }, { status: 404 })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()
  const authorName = profile?.full_name?.trim()
    || user.user_metadata?.full_name?.trim()
    || 'Użytkownik'

  const { data, error } = await supabase
    .from('training_reviews')
    .insert({
      booking_id: booking.id,
      trainer_id: trainerId,
      user_id: user.id,
      author_name: authorName.slice(0, 120),
      rating: validated.rating,
      comment: validated.comment,
    })
    .select()
    .single()

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'Ta rezerwacja ma już opinię' }, { status: 409 })
  }
  if (error) {
    return NextResponse.json({ error: 'Nie udało się zapisać opinii' }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
