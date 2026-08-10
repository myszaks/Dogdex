import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { createTrainingCommerceRefund } from '@/lib/trainingCommerceRefund'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'

interface Params { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera płatności' }, { status: 503 })
  const db = createServerClient()
  const { data: payment } = await db.from('training_commerce_payments')
    .select('id, user_id, trainer_id, business_profile_id').eq('id', id).maybeSingle()
  if (!payment) return NextResponse.json({ error: 'Nie znaleziono płatności' }, { status: 404 })
  if (payment.user_id !== user.id && payment.trainer_id !== user.id) {
    if (!payment.business_profile_id) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
    const result = await requireBusinessProfileAccessForApi(payment.business_profile_id, 'refunds.manage')
    if ('error' in result) return result.error
  }
  let reason: string | null = null
  try { const body = await req.json(); reason = typeof body.reason === 'string' ? body.reason : null } catch {}
  try {
    return NextResponse.json(await createTrainingCommerceRefund(payment.id, user.id, reason))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Nie udało się wykonać zwrotu' }, { status: 409 })
  }
}
