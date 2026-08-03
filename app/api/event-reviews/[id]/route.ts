import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'

interface Params {
  params: Promise<{ id: string }>
}

function validateReview(body: Record<string, unknown>) {
  const rating = Number(body.rating)
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'Ocena musi być liczbą od 1 do 5'
  if (comment.length > 2000) return 'Opinia może mieć maksymalnie 2000 znaków'
  return { rating, comment: comment || null }
}

async function ownedReview(id: string) {
  const { user } = await getServerUser()
  if (!user) return { error: 'Brak uprawnień', status: 401 } as const
  if (!hasServiceRoleKey()) return { error: 'Brak konfiguracji serwera opinii', status: 503 } as const

  const supabase = createServerClient()
  const { data: review } = await supabase
    .from('event_reviews')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle()
  if (!review || review.user_id !== user.id) return { error: 'Nie znaleziono opinii', status: 404 } as const
  return { supabase, review } as const
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }
  const validated = validateReview(body)
  if (typeof validated === 'string') return NextResponse.json({ error: validated }, { status: 400 })

  const context = await ownedReview(id)
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
  const { data, error } = await context.supabase
    .from('event_reviews')
    .update(validated)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Nie udało się zaktualizować opinii' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const context = await ownedReview(id)
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
  const { error } = await context.supabase.from('event_reviews').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Nie udało się usunąć opinii' }, { status: 500 })
  return NextResponse.json({ success: true })
}
