import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { hasServiceRoleKey } from '@/lib/supabaseServer'
import { isPayoutRole } from '@/lib/roles'
import { reconcileEventPayments } from '@/lib/eventReconciliation'

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!cronSecret || provided !== cronSecret) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera' }, { status: 503 })
  try {
    return NextResponse.json(await reconcileEventPayments())
  } catch (error) {
    console.error('[event-reconcile] Cron failed:', error)
    return NextResponse.json({ error: 'Nie udało się uzgodnić płatności wydarzeń' }, { status: 500 })
  }
}

export async function POST() {
  const { user, role } = await getServerUser()
  if (!user || !isPayoutRole(role)) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera' }, { status: 503 })
  try {
    return NextResponse.json(await reconcileEventPayments(user.id))
  } catch (error) {
    console.error('[event-reconcile] Manual reconciliation failed:', error)
    return NextResponse.json({ error: 'Nie udało się uzgodnić płatności' }, { status: 500 })
  }
}
