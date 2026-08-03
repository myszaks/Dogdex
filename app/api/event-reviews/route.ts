import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { effectiveEventStatus } from '@/lib/eventStatus'

function validateReview(body: Record<string, unknown>) {
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

async function reviewContext(eventId: string) {
  const { user } = await getServerUser()
  if (!user) return { error: 'Brak uprawnień', status: 401 } as const
  if (!hasServiceRoleKey()) return { error: 'Brak konfiguracji serwera opinii', status: 503 } as const

  const supabase = createServerClient()
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, slug, title, created_by, status, start_at, end_at')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError || !event?.created_by) return { error: 'Nie znaleziono wydarzenia', status: 404 } as const

  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, participants(user_id, owner_email)')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  if (registrationsError) return { error: 'Nie udało się sprawdzić udziału', status: 500 } as const
  const email = user.email?.trim().toLowerCase()
  const eligible = (registrations ?? []).some(registration => {
    const participant = firstRelation(registration.participants)
    return participant?.user_id === user.id
      || Boolean(email && participant?.owner_email?.trim().toLowerCase() === email)
  }) && effectiveEventStatus(event) === 'finished'

  const { data: review } = await supabase
    .from('event_reviews')
    .select('*')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .maybeSingle()

  return { supabase, user, event, eligible, review } as const
}

export async function GET(req: Request) {
  const eventId = new URL(req.url).searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'Brakuje identyfikatora wydarzenia' }, { status: 400 })

  const context = await reviewContext(eventId)
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
  return NextResponse.json({ eligible: context.eligible, review: context.review ?? null })
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }
  if (typeof body.event_id !== 'string' || !body.event_id) {
    return NextResponse.json({ error: 'Brakuje identyfikatora wydarzenia' }, { status: 400 })
  }
  const validated = validateReview(body)
  if ('error' in validated) return NextResponse.json({ error: validated.error }, { status: 400 })

  const context = await reviewContext(body.event_id)
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
  if (!context.eligible) {
    return NextResponse.json({ error: 'Opinię może dodać uczestnik po zakończeniu wydarzenia' }, { status: 403 })
  }
  if (context.review) {
    return NextResponse.json({ error: 'To wydarzenie ma już Twoją opinię' }, { status: 409 })
  }

  const { data: profile } = await context.supabase
    .from('profiles')
    .select('full_name')
    .eq('id', context.user.id)
    .maybeSingle()
  const authorName = profile?.full_name?.trim()
    || context.user.user_metadata?.full_name?.trim()
    || 'Użytkownik'

  const { data, error } = await context.supabase
    .from('event_reviews')
    .insert({
      event_id: context.event.id,
      organizer_id: context.event.created_by,
      user_id: context.user.id,
      author_name: authorName.slice(0, 120),
      rating: validated.rating,
      comment: validated.comment,
    })
    .select()
    .single()

  if (error?.code === '23505') return NextResponse.json({ error: 'To wydarzenie ma już Twoją opinię' }, { status: 409 })
  if (error) return NextResponse.json({ error: 'Nie udało się zapisać opinii' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
