import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient } from '@/lib/supabaseServer'
import { retryEventRefund } from '@/lib/eventRefund'
import { getBusinessProfileAccess } from '@/lib/businessAccess'

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  const db = createServerClient()
  const { data: refund } = await db.from('event_refunds')
    .select('id, event_payments(payee_user_id, business_profile_id)').eq('id', id).maybeSingle()
  const payment = Array.isArray(refund?.event_payments) ? refund.event_payments[0] : refund?.event_payments
  const businessAccess = payment?.business_profile_id ? await getBusinessProfileAccess(payment.business_profile_id) : null
  if (!refund || (role !== 'admin' && payment?.payee_user_id !== user.id && !businessAccess?.can('refunds.manage'))) {
    return NextResponse.json({ error: 'Nie znaleziono zwrotu' }, { status: 404 })
  }
  try {
    const result = await retryEventRefund(id)
    return NextResponse.json(result, { status: result.status === 'succeeded' ? 200 : 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Nie udało się ponowić zwrotu' }, { status: 409 })
  }
}
