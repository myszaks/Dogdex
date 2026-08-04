import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { parseReviewType, reviewTable, type ReviewModerationStatus } from '@/lib/reviewSafety'

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera opinii' }, { status: 503 })
  const { id } = await params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = body.action
  if (!['dismiss', 'hide', 'remove', 'restore'].includes(String(action))) {
    return NextResponse.json({ error: 'Nieprawidłowa decyzja moderacyjna' }, { status: 400 })
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''
  const supabase = createServerClient()
  const { data: report } = await supabase.from('review_reports').select('*').eq('id', id).maybeSingle()
  const type = parseReviewType(report?.review_type)
  if (!report || !type) return NextResponse.json({ error: 'Nie znaleziono zgłoszenia' }, { status: 404 })

  if (action !== 'dismiss') {
    const moderationStatus: ReviewModerationStatus = action === 'restore' ? 'published' : action === 'remove' ? 'removed' : 'hidden'
    const { error: reviewError } = await supabase.from(reviewTable(type)).update({
      moderation_status: moderationStatus,
      moderation_reason: action === 'restore' ? null : note || `Zgłoszenie: ${report.reason}`,
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
    }).eq('id', report.review_id)
    if (reviewError) return NextResponse.json({ error: 'Nie udało się zmienić widoczności opinii' }, { status: 500 })
  }
  const now = new Date().toISOString()
  const { data, error } = await supabase.from('review_reports').update({
    status: action === 'dismiss' ? 'dismissed' : 'actioned',
    resolved_at: now,
    resolved_by: user.id,
    resolution_note: note || null,
  }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Nie udało się zamknąć zgłoszenia' }, { status: 500 })
  return NextResponse.json(data)
}
