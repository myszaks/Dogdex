import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'

interface Params {
  params: Promise<{ token: string }>
}

export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params
  const db = createServerClient()
  const { data: payment } = await db
    .from('event_payments')
    .select('checkout_url, status, expires_at, registration_id')
    .eq('checkout_token', token)
    .maybeSingle()

  if (!payment) return NextResponse.json({ error: 'Nie znaleziono płatności' }, { status: 404 })
  if (payment.status !== 'pending' || !payment.checkout_url) {
    return NextResponse.json({ error: 'Ta płatność nie jest już aktywna' }, { status: 409 })
  }
  if (payment.expires_at && new Date(payment.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'Link do płatności wygasł' }, { status: 410 })
  }
  return NextResponse.redirect(payment.checkout_url)
}
