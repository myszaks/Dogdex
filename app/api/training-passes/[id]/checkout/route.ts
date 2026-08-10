import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { createTrainingCommerceCheckout, TrainingCommerceError } from '@/lib/trainingCommerceCheckout'

interface Params { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera płatności' }, { status: 503 })
  const db = createServerClient()
  const { data: pass, error } = await db.from('training_passes')
    .select('id, user_id, status, training_pass_products!inner(trainer_id, name, entries, validity_days, price, currency)')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Nie udało się sprawdzić karnetu' }, { status: 500 })
  if (!pass) return NextResponse.json({ error: 'Nie znaleziono karnetu' }, { status: 404 })
  const product = Array.isArray(pass.training_pass_products) ? pass.training_pass_products[0] : pass.training_pass_products
  if (!product || pass.status !== 'pending' || Number(product.price) <= 0) {
    return NextResponse.json({ error: 'Ten karnet nie oczekuje na płatność online' }, { status: 409 })
  }
  try {
    const checkout = await createTrainingCommerceCheckout(req, {
      kind: 'pass', entityId: pass.id, userId: user.id,
      trainerId: product.trainer_id, customerEmail: user.email,
      name: product.name,
      description: `${product.entries} wejść, ważność ${product.validity_days} dni`,
      amount: Number(product.price), currency: product.currency,
    })
    return NextResponse.json(checkout)
  } catch (checkoutError) {
    const message = checkoutError instanceof Error ? checkoutError.message : 'Nie udało się rozpocząć płatności'
    const status = checkoutError instanceof TrainingCommerceError ? checkoutError.status : 502
    return NextResponse.json({ error: message }, { status })
  }
}
