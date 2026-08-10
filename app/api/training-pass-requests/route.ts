import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'
import { sendTrainingCommerceStatusEmail } from '@/lib/email'
import { parseTrainingPassRequestInput } from '@/lib/trainingCustomerSelfService'

export async function GET(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  const db = createServerClient()
  const url = new URL(req.url)
  const trainerView = url.searchParams.get('trainer') === '1'
  if (trainerView) {
    const result = await requireBusinessProfileAccessForApi(url.searchParams.get('profileId'), 'passes.manage')
    if ('error' in result) return result.error
    const { data, error } = await db.from('training_pass_requests').select(`
      *,
      training_passes!inner(
        id, user_id, dog_id, status, entries_total, entries_remaining, expires_at,
        dogs(id, name),
        training_pass_products!inner(id, name, trainer_id, business_profile_id)
      )
    `).eq('training_passes.training_pass_products.business_profile_id', result.access.profile.id).order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: 'Nie udało się pobrać wniosków' }, { status: 500 })
    return NextResponse.json({ requests: data ?? [] })
  }
  const { data, error } = await db.from('training_pass_requests')
    .select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Nie udało się pobrać wniosków' }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera' }, { status: 503 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 }) }
  const input = parseTrainingPassRequestInput(body)
  if (!input || typeof body.passId !== 'string') {
    return NextResponse.json({ error: 'Podaj rodzaj wniosku, uzasadnienie i poprawną liczbę dni' }, { status: 400 })
  }
  const db = createServerClient()
  const { data: pass } = await db.from('training_passes').select(`
    id, user_id, status,
    training_pass_products!inner(name, trainer_id, freeze_policy)
  `).eq('id', body.passId).eq('user_id', user.id).maybeSingle()
  if (!pass) return NextResponse.json({ error: 'Nie znaleziono karnetu' }, { status: 404 })
  if (input.requestType === 'freeze' && pass.status !== 'active') {
    return NextResponse.json({ error: 'Można wnioskować o zamrożenie tylko aktywnego karnetu' }, { status: 409 })
  }
  if (input.requestType === 'extend' && !['active', 'frozen', 'expired'].includes(pass.status)) {
    return NextResponse.json({ error: 'Tego karnetu nie można przedłużyć' }, { status: 409 })
  }
  const { data, error } = await db.from('training_pass_requests').insert({
    pass_id: pass.id,
    user_id: user.id,
    request_type: input.requestType,
    requested_days: input.requestedDays,
    reason: input.reason,
  }).select().single()
  if (error) {
    const duplicate = error.code === '23505'
    return NextResponse.json({ error: duplicate ? 'Taki wniosek już czeka na rozpatrzenie' : 'Nie udało się wysłać wniosku' }, { status: duplicate ? 409 : 500 })
  }
  const product = Array.isArray(pass.training_pass_products) ? pass.training_pass_products[0] : pass.training_pass_products
  if (product?.trainer_id) {
    const { data: trainer } = await db.auth.admin.getUserById(product.trainer_id)
    if (trainer.user?.email) await sendTrainingCommerceStatusEmail({
      to: trainer.user.email,
      title: 'Nowy wniosek dotyczący karnetu',
      message: `Uczestnik prosi o ${input.requestType === 'freeze' ? 'zamrożenie' : `przedłużenie o ${input.requestedDays} dni`} karnetu „${product.name}”.`,
    })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera' }, { status: 503 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 }) }
  if (typeof body.requestId !== 'string') return NextResponse.json({ error: 'Brak wniosku' }, { status: 400 })
  const db = createServerClient()

  if (body.action === 'cancel') {
    const { data, error } = await db.from('training_pass_requests').update({ status: 'cancelled' })
      .eq('id', body.requestId).eq('user_id', user.id).eq('status', 'pending').select().maybeSingle()
    if (error) return NextResponse.json({ error: 'Nie udało się wycofać wniosku' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Wniosek nie jest już aktywny' }, { status: 409 })
    return NextResponse.json(data)
  }

  if (!['approve', 'reject'].includes(String(body.action))) return NextResponse.json({ error: 'Nieprawidłowa akcja' }, { status: 400 })
  const { data: requestRecord } = await db.from('training_pass_requests').select('training_passes!inner(training_pass_products!inner(business_profile_id))').eq('id', body.requestId).maybeSingle()
  const passRelation = Array.isArray(requestRecord?.training_passes) ? requestRecord.training_passes[0] : requestRecord?.training_passes
  const productRelation = Array.isArray(passRelation?.training_pass_products) ? passRelation.training_pass_products[0] : passRelation?.training_pass_products
  if (!productRelation?.business_profile_id) return NextResponse.json({ error: 'Nie znaleziono wniosku' }, { status: 404 })
  const result = await requireBusinessProfileAccessForApi(productRelation.business_profile_id, 'passes.manage')
  if ('error' in result) return result.error
  const { data, error } = await db.rpc('resolve_training_pass_request', {
    target_request_id: body.requestId,
    target_trainer_id: result.access.profile.owner_id,
    approve_request: body.action === 'approve',
    target_response_note: typeof body.responseNote === 'string' ? body.responseNote.slice(0, 1000) : '',
  })
  if (error) {
    const conflict = error.message?.includes('already_resolved') || error.message?.includes('not_active') || error.message?.includes('cannot_be_extended')
    return NextResponse.json({ error: conflict ? 'Wniosek lub stan karnetu uległ zmianie' : 'Nie udało się rozpatrzyć wniosku' }, { status: conflict ? 409 : 500 })
  }
  const resolved = Array.isArray(data) ? data[0] : data
  if (resolved?.user_id) {
    const { data: customer } = await db.auth.admin.getUserById(resolved.user_id)
    if (customer.user?.email) await sendTrainingCommerceStatusEmail({
      to: customer.user.email,
      title: body.action === 'approve' ? 'Wniosek dotyczący karnetu został zaakceptowany' : 'Wniosek dotyczący karnetu został odrzucony',
      message: typeof body.responseNote === 'string' && body.responseNote.trim()
        ? body.responseNote.trim()
        : body.action === 'approve' ? 'Zmiana została zastosowana do Twojego karnetu.' : 'Trener nie zaakceptował wniosku.',
    })
  }
  return NextResponse.json(resolved)
}
