import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'
import { consumePassBalance } from '@/lib/trainingGroups'
import { createTrainingCommerceCheckout, TrainingCommerceError } from '@/lib/trainingCommerceCheckout'
import { cancelTrainingCommerceCheckout } from '@/lib/trainingCommerceCheckout'
import { createTrainingCommerceRefund } from '@/lib/trainingCommerceRefund'
import { sendTrainingCommerceStatusEmail } from '@/lib/email'

export async function GET(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  const db = createServerClient()
  const url = new URL(req.url)
  const mine = url.searchParams.get('mine') === '1'
  if (!mine) {
    const result = await requireBusinessProfileAccessForApi(url.searchParams.get('profileId'), 'passes.manage')
    if ('error' in result) return result.error
    const { data: products } = await db.from('training_pass_products').select('*').eq('business_profile_id', result.access.profile.id).order('created_at', { ascending: false })
    const ids = (products ?? []).map(product => product.id)
    const { data: passes } = ids.length > 0
      ? await db.from('training_passes').select('*, dogs(id, name), training_pass_products(*)').in('product_id', ids).order('created_at', { ascending: false })
      : { data: [] }
    return NextResponse.json({ products: products ?? [], passes: passes ?? [] })
  }
  const { data: passes } = await db.from('training_passes').select(`
    *, dogs(id, name), training_pass_products(*),
    training_pass_usages(*, training_bookings(scheduled_at, training_types(name)), training_course_sessions(starts_at, training_courses(name))),
    training_pass_adjustments(*),
    training_pass_requests(*),
    training_commerce_payments(
      id, status, amount, currency, refunded_amount, receipt_url, completed_at, created_at,
      training_commerce_refunds(id, status, amount, reason, error_message, created_at, updated_at)
    )
  `).eq('user_id', user.id).order('created_at', { ascending: false })
  return NextResponse.json({ passes: passes ?? [] })
}

export async function POST(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera płatności' }, { status: 503 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }
  const db = createServerClient()

  if (body.action === 'create_product') {
    const result = await requireBusinessProfileAccessForApi(typeof body.businessProfileId === 'string' ? body.businessProfileId : null, 'passes.manage')
    if ('error' in result) return result.error
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const entries = Number(body.entries)
    const validityDays = Number(body.validityDays ?? 90)
    const price = Number(body.price ?? 0)
    if (!name || !Number.isInteger(entries) || entries < 1 || entries > 100) return NextResponse.json({ error: 'Podaj nazwę i liczbę wejść 1–100' }, { status: 400 })
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 730 || !Number.isFinite(price) || price < 0) return NextResponse.json({ error: 'Nieprawidłowa ważność lub cena' }, { status: 400 })
    const trainingTypeId = typeof body.trainingTypeId === 'string' && body.trainingTypeId ? body.trainingTypeId : null
    if (trainingTypeId) {
      const { data: ownedType } = await db.from('training_types').select('id').eq('id', trainingTypeId).eq('business_profile_id', result.access.profile.id).maybeSingle()
      if (!ownedType) return NextResponse.json({ error: 'Wybrany rodzaj treningu nie należy do tego profilu' }, { status: 400 })
    }
    const { data, error } = await db.from('training_pass_products').insert({
      trainer_id: result.access.profile.owner_id,
      business_profile_id: result.access.profile.id,
      training_type_id: trainingTypeId,
      name,
      description: typeof body.description === 'string' ? body.description.trim().slice(0, 2000) || null : null,
      cancellation_policy: typeof body.cancellationPolicy === 'string' ? body.cancellationPolicy.trim().slice(0, 3000) || null : null,
      freeze_policy: typeof body.freezePolicy === 'string' ? body.freezePolicy.trim().slice(0, 2000) || null : null,
      entries,
      validity_days: validityDays,
      price,
    }).select().single()
    if (error) return NextResponse.json({ error: 'Nie udało się utworzyć karnetu' }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  if (body.action === 'purchase') {
    if (typeof body.productId !== 'string' || typeof body.dogId !== 'string') return NextResponse.json({ error: 'Wybierz karnet i psa' }, { status: 400 })
    const [{ data: product }, { data: dog }] = await Promise.all([
      db.from('training_pass_products').select('*').eq('id', body.productId).eq('is_active', true).maybeSingle(),
      db.from('dogs').select('id').eq('id', body.dogId).eq('user_id', user.id).maybeSingle(),
    ])
    if (!product) return NextResponse.json({ error: 'Karnet jest niedostępny' }, { status: 404 })
    if (!dog) return NextResponse.json({ error: 'Nieprawidłowy pies' }, { status: 403 })
    if ((product.cancellation_policy || product.freeze_policy) && body.policyAccepted !== true) {
      return NextResponse.json({ error: 'Zaakceptuj zasady karnetu przed zakupem' }, { status: 400 })
    }
    const free = Number(product.price) === 0
    const validFrom = free ? new Date() : null
    const expires = validFrom ? new Date(validFrom.getTime() + product.validity_days * 86400000) : null
    const { data, error } = await db.from('training_passes').insert({
      product_id: product.id,
      user_id: user.id,
      dog_id: dog.id,
      entries_total: product.entries,
      entries_remaining: product.entries,
      status: free ? 'active' : 'pending',
      payment_status: free ? 'manual' : 'pending',
      valid_from: validFrom?.toISOString().slice(0, 10) ?? null,
      expires_at: expires?.toISOString().slice(0, 10) ?? null,
      payment_expires_at: free ? null : new Date(Date.now() + 35 * 60 * 1000).toISOString(),
      policy_accepted_at: product.cancellation_policy || product.freeze_policy ? new Date().toISOString() : null,
      policy_snapshot: [product.cancellation_policy ? `Rezygnacja i zwroty:\n${product.cancellation_policy}` : '', product.freeze_policy ? `Zamrożenie i przedłużenie:\n${product.freeze_policy}` : ''].filter(Boolean).join('\n\n') || null,
    }).select().single()
    if (error || !data) return NextResponse.json({ error: 'Nie udało się utworzyć karnetu' }, { status: 500 })
    if (free) return NextResponse.json({ ...data, checkoutUrl: null }, { status: 201 })

    try {
      const checkout = await createTrainingCommerceCheckout(req, {
        kind: 'pass', entityId: data.id, userId: user.id,
        trainerId: product.trainer_id, customerEmail: user.email,
        name: product.name,
        description: `${product.entries} wejść, ważność ${product.validity_days} dni`,
        amount: Number(product.price), currency: product.currency,
      })
      return NextResponse.json({ ...data, checkoutUrl: checkout.checkoutUrl }, { status: 201 })
    } catch (checkoutError) {
      await db.from('training_passes').update({ status: 'cancelled', payment_status: 'unpaid', payment_expires_at: null }).eq('id', data.id)
      const message = checkoutError instanceof Error ? checkoutError.message : 'Nie udało się rozpocząć płatności'
      const status = checkoutError instanceof TrainingCommerceError ? checkoutError.status : 502
      return NextResponse.json({ error: message }, { status })
    }
  }

  return NextResponse.json({ error: 'Nieprawidłowa akcja' }, { status: 400 })
}

export async function PATCH(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera płatności' }, { status: 503 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }
  const db = createServerClient()

  if (body.action === 'update_product' || body.action === 'toggle_product') {
    if (typeof body.productId !== 'string') return NextResponse.json({ error: 'Brak oferty karnetu' }, { status: 400 })
    const { data: product } = await db.from('training_pass_products').select('*').eq('id', body.productId).maybeSingle()
    if (!product) return NextResponse.json({ error: 'Nie znaleziono oferty' }, { status: 404 })
    const result = await requireBusinessProfileAccessForApi(product.business_profile_id, 'passes.manage')
    if ('error' in result) return result.error
    if (body.action === 'toggle_product') {
      const { data, error } = await db.from('training_pass_products').update({ is_active: !product.is_active }).eq('id', product.id).select().single()
      return error ? NextResponse.json({ error: 'Nie udało się zmienić oferty' }, { status: 500 }) : NextResponse.json(data)
    }
    const update: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim().slice(0, 120)
    if (typeof body.description === 'string') update.description = body.description.trim().slice(0, 2000) || null
    if (typeof body.cancellationPolicy === 'string') update.cancellation_policy = body.cancellationPolicy.trim().slice(0, 3000) || null
    if (typeof body.freezePolicy === 'string') update.freeze_policy = body.freezePolicy.trim().slice(0, 2000) || null
    if (typeof body.validityDays === 'number' && Number.isInteger(body.validityDays) && body.validityDays >= 1 && body.validityDays <= 730) update.validity_days = body.validityDays
    if (typeof body.entries === 'number' && Number.isInteger(body.entries) && body.entries >= 1 && body.entries <= 100) update.entries = body.entries
    if (typeof body.trainingTypeId === 'string' || body.trainingTypeId === null) update.training_type_id = body.trainingTypeId || null
    if (typeof body.price === 'number' && Number.isFinite(body.price) && body.price >= 0) {
      const { count } = await db.from('training_passes').select('id', { count: 'exact', head: true }).eq('product_id', product.id)
      if ((count ?? 0) > 0) return NextResponse.json({ error: 'Nie można zmienić ceny sprzedawanej już oferty. Utwórz nową.' }, { status: 409 })
      update.price = body.price
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Brak zmian' }, { status: 400 })
    const { data, error } = await db.from('training_pass_products').update(update).eq('id', product.id).select().single()
    return error ? NextResponse.json({ error: 'Nie udało się zapisać oferty' }, { status: 500 }) : NextResponse.json(data)
  }

  if (typeof body.passId !== 'string') return NextResponse.json({ error: 'Brak karnetu' }, { status: 400 })
  const { data: pass } = await db.from('training_passes').select('*, training_pass_products!inner(trainer_id, validity_days, business_profile_id)').eq('id', body.passId).maybeSingle()
  const product = Array.isArray(pass?.training_pass_products) ? pass?.training_pass_products[0] : pass?.training_pass_products
  if (!pass || !product) return NextResponse.json({ error: 'Nie znaleziono karnetu' }, { status: 404 })
  const result = await requireBusinessProfileAccessForApi(product.business_profile_id, body.action === 'refund' ? 'refunds.manage' : 'passes.manage')
  if ('error' in result) return result.error

  if (body.action === 'activate_manual' || body.action === 'activate') {
    if (pass.payment_status === 'paid') return NextResponse.json({ error: 'Karnet został już opłacony online' }, { status: 409 })
    if (pass.payment_status === 'pending') return NextResponse.json({ error: 'Karnet ma aktywną sesję Stripe. Poczekaj na jej zakończenie.' }, { status: 409 })
    const validFrom = new Date()
    const expires = new Date(validFrom.getTime() + Number(product.validity_days) * 86400000)
    const { data, error } = await db.from('training_passes').update({ status: 'active', payment_status: 'manual', valid_from: validFrom.toISOString().slice(0, 10), expires_at: expires.toISOString().slice(0, 10), payment_expires_at: null }).eq('id', pass.id).select().single()
    if (error) return NextResponse.json({ error: 'Nie udało się aktywować karnetu' }, { status: 500 })
    const { data: customer } = await db.auth.admin.getUserById(pass.user_id)
    if (customer.user?.email) await sendTrainingCommerceStatusEmail({ to: customer.user.email, title: 'Karnet jest aktywny', message: 'Trener potwierdził płatność ręczną i aktywował wejścia.' })
    return NextResponse.json(data)
  }

  if (body.action === 'consume') {
    if (pass.expires_at && pass.expires_at < new Date().toISOString().slice(0, 10)) {
      await db.from('training_passes').update({ status: 'expired' }).eq('id', pass.id)
      return NextResponse.json({ error: 'Karnet stracił ważność' }, { status: 409 })
    }
    if (pass.status !== 'active' || pass.entries_remaining < 1) return NextResponse.json({ error: 'Karnet nie ma dostępnych wejść' }, { status: 409 })
    const balance = consumePassBalance(pass.entries_remaining)
    if (!balance) return NextResponse.json({ error: 'Karnet nie ma dostępnych wejść' }, { status: 409 })
    const { data: usage, error: usageError } = await db.from('training_pass_usages').insert({ pass_id: pass.id, entries_used: 1, source: 'manual', note: typeof body.note === 'string' ? body.note.slice(0, 500) : 'Ręczne wykorzystanie przez trenera' }).select('id').single()
    if (usageError || !usage) return NextResponse.json({ error: 'Nie udało się zapisać użycia karnetu' }, { status: 500 })
    const { data, error } = await db.from('training_passes').update({ entries_remaining: balance.remaining, status: balance.status }).eq('id', pass.id).eq('entries_remaining', pass.entries_remaining).select().maybeSingle()
    if (error || !data) {
      await db.from('training_pass_usages').update({ status: 'reversed' }).eq('id', usage.id)
      return NextResponse.json({ error: 'Saldo karnetu zmieniło się. Odśwież widok.' }, { status: 409 })
    }
    return NextResponse.json(data)
  }

  if (body.action === 'extend') {
    const days = Number(body.days)
    if (!Number.isInteger(days) || days < 1 || days > 730) return NextResponse.json({ error: 'Podaj 1–730 dni' }, { status: 400 })
    const previous = pass.expires_at
    const base = previous && previous > new Date().toISOString().slice(0, 10) ? new Date(previous) : new Date()
    base.setUTCDate(base.getUTCDate() + days)
    const next = base.toISOString().slice(0, 10)
    const { data, error } = await db.from('training_passes').update({ expires_at: next, expiry_notification_sent_at: null }).eq('id', pass.id).select().single()
    if (error) return NextResponse.json({ error: 'Nie udało się przedłużyć karnetu' }, { status: 500 })
    await db.from('training_pass_adjustments').insert({ pass_id: pass.id, actor_id: user.id, action: 'extend', previous_expires_at: previous, next_expires_at: next, note: typeof body.note === 'string' ? body.note.slice(0, 500) : null })
    return NextResponse.json(data)
  }
  if (body.action === 'freeze') {
    if (pass.status !== 'active') return NextResponse.json({ error: 'Można zamrozić tylko aktywny karnet' }, { status: 409 })
    const now = new Date().toISOString()
    const { data, error } = await db.from('training_passes').update({ status: 'frozen', frozen_at: now }).eq('id', pass.id).select().single()
    if (error) return NextResponse.json({ error: 'Nie udało się zamrozić karnetu' }, { status: 500 })
    await db.from('training_pass_adjustments').insert({ pass_id: pass.id, actor_id: user.id, action: 'freeze', previous_expires_at: pass.expires_at, next_expires_at: pass.expires_at })
    return NextResponse.json(data)
  }
  if (body.action === 'unfreeze') {
    if (pass.status !== 'frozen' || !pass.frozen_at) return NextResponse.json({ error: 'Karnet nie jest zamrożony' }, { status: 409 })
    const frozenDays = Math.max(1, Math.ceil((Date.now() - new Date(pass.frozen_at).getTime()) / 86400000))
    const nextDate = pass.expires_at ? new Date(pass.expires_at) : new Date()
    nextDate.setUTCDate(nextDate.getUTCDate() + frozenDays)
    const next = nextDate.toISOString().slice(0, 10)
    const { data, error } = await db.from('training_passes').update({ status: 'active', frozen_at: null, expires_at: next, expiry_notification_sent_at: null }).eq('id', pass.id).select().single()
    if (error) return NextResponse.json({ error: 'Nie udało się wznowić karnetu' }, { status: 500 })
    await db.from('training_pass_adjustments').insert({ pass_id: pass.id, actor_id: user.id, action: 'unfreeze', previous_expires_at: pass.expires_at, next_expires_at: next })
    return NextResponse.json(data)
  }
  if (body.action === 'balance') {
    const remaining = Number(body.entriesRemaining)
    if (!Number.isInteger(remaining) || remaining < 0 || remaining > pass.entries_total) return NextResponse.json({ error: 'Nieprawidłowe saldo' }, { status: 400 })
    const { data, error } = await db.from('training_passes').update({ entries_remaining: remaining, status: remaining === 0 ? 'used' : pass.status === 'used' ? 'active' : pass.status }).eq('id', pass.id).select().single()
    if (error) return NextResponse.json({ error: 'Nie udało się skorygować salda' }, { status: 500 })
    await db.from('training_pass_adjustments').insert({ pass_id: pass.id, actor_id: user.id, action: 'balance', entries_delta: remaining - pass.entries_remaining, note: typeof body.note === 'string' ? body.note.slice(0, 500) : null })
    return NextResponse.json(data)
  }
  if (body.action === 'transfer') {
    if (typeof body.dogId !== 'string') return NextResponse.json({ error: 'Wybierz psa' }, { status: 400 })
    const { data: dog } = await db.from('dogs').select('id').eq('id', body.dogId).eq('user_id', pass.user_id).maybeSingle()
    if (!dog) return NextResponse.json({ error: 'Pies nie należy do właściciela karnetu' }, { status: 409 })
    const { data, error } = await db.from('training_passes').update({ dog_id: dog.id }).eq('id', pass.id).select().single()
    if (error) return NextResponse.json({ error: 'Nie udało się przenieść karnetu' }, { status: 500 })
    await db.from('training_pass_adjustments').insert({ pass_id: pass.id, actor_id: user.id, action: 'transfer', previous_dog_id: pass.dog_id, next_dog_id: dog.id, note: typeof body.note === 'string' ? body.note.slice(0, 500) : null })
    return NextResponse.json(data)
  }
  if (body.action === 'refund') {
    const { data: payment } = await db.from('training_commerce_payments').select('id').eq('pass_id', pass.id).eq('status', 'completed').maybeSingle()
    if (!payment) return NextResponse.json({ error: 'Nie znaleziono płatności do zwrotu' }, { status: 404 })
    try { return NextResponse.json(await createTrainingCommerceRefund(payment.id, user.id, typeof body.reason === 'string' ? body.reason : 'Zwrot karnetu przez trenera')) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Nie udało się wykonać zwrotu' }, { status: 409 }) }
  }
  if (body.action === 'cancel') {
    const { data: payment } = await db.from('training_commerce_payments').select('id, status').eq('pass_id', pass.id).maybeSingle()
    if (payment?.status === 'completed') return NextResponse.json({ error: 'Opłacony karnet należy zwrócić, nie anulować' }, { status: 409 })
    if (payment?.status === 'pending') await cancelTrainingCommerceCheckout(payment.id)
    const { data, error } = await db.from('training_passes').update({ status: 'cancelled', payment_expires_at: null }).eq('id', pass.id).select().single()
    return error ? NextResponse.json({ error: 'Nie udało się anulować karnetu' }, { status: 500 }) : NextResponse.json(data)
  }
  return NextResponse.json({ error: 'Nieprawidłowa akcja' }, { status: 400 })
}
