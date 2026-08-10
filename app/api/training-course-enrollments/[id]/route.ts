import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { cancelTrainingCommerceCheckout } from '@/lib/trainingCommerceCheckout'
import { createTrainingCommerceRefund } from '@/lib/trainingCommerceRefund'
import { notifyTrainingEnrollment } from '@/lib/trainingCommerceNotifications'
import { canChangeEnrollmentDog } from '@/lib/trainingCustomerSelfService'

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 }) }
  const db = createServerClient()
  const { data: enrollment } = await db.from('training_course_enrollments')
    .select('id, course_id, dog_id, status, payment_status')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!enrollment) return NextResponse.json({ error: 'Nie znaleziono zapisu' }, { status: 404 })
  if (!['pending', 'confirmed', 'waitlisted'].includes(enrollment.status)) {
    return NextResponse.json({ error: 'Tego zapisu nie można już edytować' }, { status: 409 })
  }

  const update: Record<string, unknown> = {}
  if (typeof body.notes === 'string') update.notes = body.notes.trim().slice(0, 1000) || null
  if (typeof body.dogId === 'string' && body.dogId !== enrollment.dog_id) {
    const [{ data: dog }, { data: firstSession }] = await Promise.all([
      db.from('dogs').select('id').eq('id', body.dogId).eq('user_id', user.id).maybeSingle(),
      db.from('training_course_sessions').select('starts_at').eq('course_id', enrollment.course_id)
        .order('starts_at', { ascending: true }).limit(1).maybeSingle(),
    ])
    if (!dog) return NextResponse.json({ error: 'Wybrany pies nie należy do Twojego profilu' }, { status: 403 })
    if (!canChangeEnrollmentDog({
      status: enrollment.status,
      paymentStatus: enrollment.payment_status,
      firstSessionAt: firstSession?.starts_at ?? null,
    })) {
      return NextResponse.json({ error: 'Psa można zmienić tylko przed płatnością i rozpoczęciem kursu' }, { status: 409 })
    }
    update.dog_id = dog.id
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Brak zmian' }, { status: 400 })
  const { data, error } = await db.from('training_course_enrollments').update(update).eq('id', enrollment.id).select('*, dogs(id, name)').single()
  if (error) {
    return NextResponse.json({ error: error.code === '23505' ? 'Ten pies jest już zapisany na kurs' : 'Nie udało się zapisać zmian' }, { status: error.code === '23505' ? 409 : 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera' }, { status: 503 })
  let reason = 'Rezygnacja uczestnika'
  try { const body = await req.json(); if (typeof body.reason === 'string') reason = body.reason.slice(0, 1000) } catch {}
  const db = createServerClient()
  const { data: enrollment } = await db.from('training_course_enrollments')
    .select('id, course_id, user_id, payment_status, status, training_commerce_payments(id, status)')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!enrollment) return NextResponse.json({ error: 'Nie znaleziono zapisu' }, { status: 404 })
  if (['cancelled', 'completed'].includes(enrollment.status)) return NextResponse.json({ error: 'Tego zapisu nie można anulować' }, { status: 409 })
  const payment = Array.isArray(enrollment.training_commerce_payments) ? enrollment.training_commerce_payments[0] : enrollment.training_commerce_payments
  try {
    let refund = null
    if (payment?.status === 'completed') refund = await createTrainingCommerceRefund(payment.id, user.id, reason)
    else {
      if (payment?.status === 'pending') await cancelTrainingCommerceCheckout(payment.id)
      await db.from('training_course_enrollments').update({
        status: 'cancelled', payment_status: enrollment.payment_status === 'pending' ? 'unpaid' : enrollment.payment_status,
        cancellation_reason: reason, cancelled_at: new Date().toISOString(), expires_at: null,
      }).eq('id', enrollment.id)
    }
    const { data: promoted } = await db.rpc('promote_training_course_waitlist', { target_course_id: enrollment.course_id })
    const promotedEnrollment = Array.isArray(promoted) ? promoted[0] : promoted
    await notifyTrainingEnrollment(enrollment.id, 'cancelled')
    if (promotedEnrollment?.id) await notifyTrainingEnrollment(promotedEnrollment.id, 'promoted')
    return NextResponse.json({ cancelled: true, refund, promoted: promotedEnrollment ?? null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Nie udało się anulować zapisu' }, { status: 409 })
  }
}
