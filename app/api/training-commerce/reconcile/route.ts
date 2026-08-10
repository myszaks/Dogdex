import { NextResponse } from 'next/server'
import { hasServiceRoleKey } from '@/lib/supabaseServer'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'
import { reconcileTrainingCommerce } from '@/lib/trainingCommerceReconciliation'
import { notifyExpiringTrainingPasses } from '@/lib/trainingCommerceNotifications'

export async function GET(req: Request) {
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera' }, { status: 503 })
  try {
    const [reconciliation, expiryNotifications] = await Promise.all([reconcileTrainingCommerce(), notifyExpiringTrainingPasses()])
    return NextResponse.json({ ...reconciliation, expiryNotifications })
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Błąd uzgadniania' }, { status: 500 }) }
}

export async function POST(req: Request) {
  const result = await requireBusinessProfileAccessForApi(new URL(req.url).searchParams.get('profileId'), 'payments.view')
  if ('error' in result) return result.error
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera' }, { status: 503 })
  try { return NextResponse.json(await reconcileTrainingCommerce(result.access.profile.id)) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Błąd uzgadniania' }, { status: 500 }) }
}
