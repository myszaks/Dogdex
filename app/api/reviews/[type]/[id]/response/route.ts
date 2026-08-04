import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { parseReviewType, reviewTable } from '@/lib/reviewSafety'

interface Params { params: Promise<{ type: string; id: string }> }

async function context(params: Params['params']) {
  const { user } = await getServerUser()
  if (!user) return { error: 'Brak uprawnień', status: 401 } as const
  if (!hasServiceRoleKey()) return { error: 'Brak konfiguracji serwera opinii', status: 503 } as const
  const { type: rawType, id } = await params
  const type = parseReviewType(rawType)
  if (!type) return { error: 'Nieprawidłowy rodzaj opinii', status: 400 } as const
  const supabase = createServerClient()
  const ownerColumn = type === 'event' ? 'organizer_id' : 'trainer_id'
  const { data: review } = await supabase.from(reviewTable(type)).select(`id, ${ownerColumn}`).eq('id', id).maybeSingle()
  const ownerId = review?.[ownerColumn as keyof typeof review]
  if (!review) return { error: 'Nie znaleziono opinii', status: 404 } as const
  if (ownerId !== user.id) return { error: 'Brak uprawnień', status: 403 } as const
  return { supabase, user, type, id } as const
}

export async function POST(req: Request, { params }: Params) {
  const ctx = await context(params)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const responseText = typeof body.response === 'string' ? body.response.trim() : ''
  if (!responseText || responseText.length > 2000) {
    return NextResponse.json({ error: 'Odpowiedź musi mieć od 1 do 2000 znaków' }, { status: 400 })
  }
  const now = new Date().toISOString()
  const { data, error } = await ctx.supabase.from(reviewTable(ctx.type)).update({
    response_text: responseText,
    response_at: now,
    response_by: ctx.user.id,
  }).eq('id', ctx.id).select('response_text, response_at').single()
  if (error) return NextResponse.json({ error: 'Nie udało się zapisać odpowiedzi' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await context(params)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { error } = await ctx.supabase.from(reviewTable(ctx.type)).update({
    response_text: null,
    response_at: null,
    response_by: null,
  }).eq('id', ctx.id)
  if (error) return NextResponse.json({ error: 'Nie udało się usunąć odpowiedzi' }, { status: 500 })
  return NextResponse.json({ success: true })
}
