import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { cancelTrainingCommerceCheckout } from '@/lib/trainingCommerceCheckout'
import { createTrainingCommerceRefund } from '@/lib/trainingCommerceRefund'

interface Params { params: Promise<{ id: string }> }

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera' }, { status: 503 })
  let reason = 'Rezygnacja z karnetu'
  try { const body = await req.json(); if (typeof body.reason === 'string') reason = body.reason.slice(0, 1000) } catch {}
  const db = createServerClient()
  const { data: pass } = await db.from('training_passes')
    .select('id, status, payment_status, entries_total, entries_remaining, training_commerce_payments(id, status)')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!pass) return NextResponse.json({ error: 'Nie znaleziono karnetu' }, { status: 404 })
  const payment = Array.isArray(pass.training_commerce_payments) ? pass.training_commerce_payments[0] : pass.training_commerce_payments
  try {
    if (payment?.status === 'completed') {
      if (pass.entries_remaining !== pass.entries_total) return NextResponse.json({ error: 'Wykorzystanego karnetu nie można automatycznie zwrócić' }, { status: 409 })
      return NextResponse.json(await createTrainingCommerceRefund(payment.id, user.id, reason))
    }
    if (payment?.status === 'pending') await cancelTrainingCommerceCheckout(payment.id)
    const { data, error } = await db.from('training_passes').update({ status: 'cancelled', payment_expires_at: null }).eq('id', pass.id).select().single()
    return error ? NextResponse.json({ error: 'Nie udało się anulować karnetu' }, { status: 500 }) : NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Nie udało się anulować karnetu' }, { status: 409 })
  }
}
