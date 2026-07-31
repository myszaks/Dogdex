import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient } from '@/lib/supabaseServer'
import { isPayoutRole } from '@/lib/roles'
import { retryEventRefund } from '@/lib/eventRefund'

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params
  const { user, role } = await getServerUser()
  if (!user || !isPayoutRole(role)) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  const db = createServerClient()
  const { data: refund } = await db.from('event_refunds')
    .select('id, event_payments(payee_user_id)').eq('id', id).maybeSingle()
  const payment = Array.isArray(refund?.event_payments) ? refund.event_payments[0] : refund?.event_payments
  if (!refund || (role !== 'admin' && payment?.payee_user_id !== user.id)) {
    return NextResponse.json({ error: 'Nie znaleziono zwrotu' }, { status: 404 })
  }
  try {
    const result = await retryEventRefund(id)
    return NextResponse.json(result, { status: result.status === 'succeeded' ? 200 : 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Nie udało się ponowić zwrotu' }, { status: 409 })
  }
}
