import { NextResponse } from 'next/server'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET nie jest skonfigurowany' }, { status: 503 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const provided = authHeader.replace(/^Bearer\s+/i, '')
  if (provided !== cronSecret) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  }
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera rezerwacji' }, { status: 503 })
  }

  const supabase = createServerClient()
  const [{ data, error }, { data: commerceExpired, error: commerceError }] = await Promise.all([
    supabase.rpc('reconcile_training_booking_states'),
    supabase.rpc('reconcile_training_commerce_states'),
  ])

  if (error || commerceError) {
    console.error('[training-reconcile] Failed:', error ?? commerceError)
    return NextResponse.json({ error: 'Nie udało się uzgodnić stanów rezerwacji' }, { status: 500 })
  }

  return NextResponse.json({
    ...(data ?? { expired: 0, completed: 0 }),
    ...(typeof commerceExpired === 'number' ? { commerceExpired } : {}),
  })
}
