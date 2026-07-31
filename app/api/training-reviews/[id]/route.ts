import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
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
  const rating = Number(body.rating)
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Ocena musi być liczbą od 1 do 5' }, { status: 400 })
  }
  if (comment.length > 2000) {
    return NextResponse.json({ error: 'Opinia może mieć maksymalnie 2000 znaków' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: review } = await supabase
    .from('training_reviews')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle()
  if (!review || review.user_id !== user.id) {
    return NextResponse.json({ error: 'Nie znaleziono opinii' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('training_reviews')
    .update({
      rating,
      comment: comment || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    return NextResponse.json({ error: 'Nie udało się zaktualizować opinii' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera opinii' }, { status: 503 })
  }

  const supabase = createServerClient()
  const { data: review } = await supabase
    .from('training_reviews')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle()
  if (!review || review.user_id !== user.id) {
    return NextResponse.json({ error: 'Nie znaleziono opinii' }, { status: 404 })
  }

  const { error } = await supabase.from('training_reviews').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: 'Nie udało się usunąć opinii' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
