import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { isReviewReportReason, parseReviewType, reviewTable } from '@/lib/reviewSafety'

export async function POST(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Zaloguj się, aby zgłosić opinię' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera opinii' }, { status: 503 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const type = parseReviewType(body.review_type)
  const reviewId = typeof body.review_id === 'string' ? body.review_id : ''
  const details = typeof body.details === 'string' ? body.details.trim() : ''
  if (!type || !reviewId || !isReviewReportReason(body.reason)) {
    return NextResponse.json({ error: 'Uzupełnij powód zgłoszenia' }, { status: 400 })
  }
  if (details.length > 1000) return NextResponse.json({ error: 'Opis może mieć maksymalnie 1000 znaków' }, { status: 400 })
  const supabase = createServerClient()
  const { data: review } = await supabase.from(reviewTable(type)).select('id, user_id').eq('id', reviewId).maybeSingle()
  if (!review) return NextResponse.json({ error: 'Nie znaleziono opinii' }, { status: 404 })
  if (review.user_id === user.id) return NextResponse.json({ error: 'Nie możesz zgłosić własnej opinii' }, { status: 409 })
  const { data, error } = await supabase.from('review_reports').insert({
    review_type: type,
    review_id: reviewId,
    reporter_id: user.id,
    reason: body.reason,
    details: details || null,
  }).select('id, status').single()
  if (error?.code === '23505') return NextResponse.json({ error: 'Ta opinia została już przez Ciebie zgłoszona' }, { status: 409 })
  if (error) return NextResponse.json({ error: 'Nie udało się wysłać zgłoszenia' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function GET() {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera opinii' }, { status: 503 })
  const supabase = createServerClient()
  const { data: reports, error } = await supabase.from('review_reports').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: 'Nie udało się pobrać zgłoszeń' }, { status: 500 })
  const eventIds = (reports ?? []).filter(report => report.review_type === 'event').map(report => report.review_id)
  const trainingIds = (reports ?? []).filter(report => report.review_type === 'training').map(report => report.review_id)
  const [eventResult, trainingResult] = await Promise.all([
    eventIds.length ? supabase.from('event_reviews').select('id, author_name, rating, comment, moderation_status, organizer_id').in('id', eventIds) : Promise.resolve({ data: [] }),
    trainingIds.length ? supabase.from('training_reviews').select('id, author_name, rating, comment, moderation_status, trainer_id').in('id', trainingIds) : Promise.resolve({ data: [] }),
  ])
  const reviews = new Map([...(eventResult.data ?? []), ...(trainingResult.data ?? [])].map(review => [review.id, review]))
  return NextResponse.json((reports ?? []).map(report => ({ ...report, review: reviews.get(report.review_id) ?? null })))
}
