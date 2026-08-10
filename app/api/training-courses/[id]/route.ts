import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient } from '@/lib/supabaseServer'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'
import type { BusinessPermission } from '@/lib/businessPermissions'
import { notifyTrainingCourseParticipants, notifyTrainingEnrollment } from '@/lib/trainingCommerceNotifications'
import { cancelTrainingCommerceCheckout } from '@/lib/trainingCommerceCheckout'
import { createTrainingCommerceRefund } from '@/lib/trainingCommerceRefund'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  const db = createServerClient()
  const { data: resource } = await db.from('training_courses').select('business_profile_id').eq('id', id).maybeSingle()
  if (!resource?.business_profile_id) return NextResponse.json({ error: 'Nie znaleziono kursu' }, { status: 404 })
  const result = await requireBusinessProfileAccessForApi(resource.business_profile_id, ['trainings.offer', 'trainings.schedule', 'trainings.attendance', 'customers.view'])
  if ('error' in result) return result.error
  const includeCustomers = result.access.can('customers.view') || result.access.can('trainings.attendance')
  const courseQuery = includeCustomers
    ? db.from('training_courses').select('*, training_course_sessions(*), training_course_enrollments(*, dogs(id, name))')
    : db.from('training_courses').select('*, training_course_sessions(*)')
  const { data: rawData } = await courseQuery.eq('id', id).eq('business_profile_id', result.access.profile.id).maybeSingle()
  const data = rawData as unknown as Record<string, unknown> & { training_course_enrollments?: Array<{ id: string }> }
  if (!data) return NextResponse.json({ error: 'Nie znaleziono kursu' }, { status: 404 })
  const enrollmentIds = (data.training_course_enrollments ?? []).map(row => row.id)
  const { data: attendance } = enrollmentIds.length > 0
    ? await db.from('training_course_attendance').select('*').in('enrollment_id', enrollmentIds)
    : { data: [] }
  return NextResponse.json({ ...data, training_course_attendance: attendance ?? [] })
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 }) }
  const db = createServerClient()
  const { data: course } = await db.from('training_courses').select('id, name, training_type_id, make_up_limit, price, business_profile_id').eq('id', id).maybeSingle()
  if (!course) return NextResponse.json({ error: 'Nie znaleziono kursu' }, { status: 404 })
  let requiredPermission: BusinessPermission = 'trainings.offer'
  if (['enrollment', 'approve_enrollment', 'approve_enrollment_manual', 'cancel_enrollment'].includes(String(body.action))) requiredPermission = 'customers.view'
  if (body.action === 'session') requiredPermission = 'trainings.schedule'
  if (body.action === 'attendance') requiredPermission = 'trainings.attendance'
  const result = await requireBusinessProfileAccessForApi(course.business_profile_id, requiredPermission)
  if ('error' in result) return result.error

  if (body.action === 'enrollment') {
    if (typeof body.enrollmentId !== 'string' || !['pending', 'confirmed', 'waitlisted', 'cancelled', 'completed'].includes(String(body.status))) {
      return NextResponse.json({ error: 'Nieprawidłowa zmiana zapisu' }, { status: 400 })
    }
    if (body.status === 'confirmed') {
      return NextResponse.json({ error: 'Użyj akceptacji zapisu z wybraną metodą płatności' }, { status: 400 })
    }
    const update: Record<string, unknown> = { status: body.status }
    const { data, error } = await db.from('training_course_enrollments').update(update).eq('id', body.enrollmentId).eq('course_id', id).select().single()
    if (error) return NextResponse.json({ error: 'Nie udało się zmienić zapisu' }, { status: 500 })
    return NextResponse.json(data)
  }

  if (body.action === 'approve_enrollment' || body.action === 'approve_enrollment_manual') {
    if (typeof body.enrollmentId !== 'string') {
      return NextResponse.json({ error: 'Nieprawidłowy zapis' }, { status: 400 })
    }
    const { data, error } = await db.rpc('approve_training_course_enrollment', {
      target_enrollment_id: body.enrollmentId,
      target_trainer_id: result.access.profile.owner_id,
      manual_payment: body.action === 'approve_enrollment_manual',
    })
    if (error) {
      const full = error.message?.includes('training_course_full')
      return NextResponse.json({ error: full ? 'Brak wolnych miejsc w grupie' : 'Nie udało się przyjąć zapisu' }, { status: full ? 409 : 500 })
    }
    const approved = Array.isArray(data) ? data[0] : data
    if (approved?.id) await notifyTrainingEnrollment(approved.id, 'approved')
    return NextResponse.json(approved)
  }

  if (body.action === 'cancel_enrollment') {
    if (typeof body.enrollmentId !== 'string') return NextResponse.json({ error: 'Brak zapisu' }, { status: 400 })
    const { data: enrollment } = await db.from('training_course_enrollments')
      .select('id, status, payment_status').eq('id', body.enrollmentId).eq('course_id', id).maybeSingle()
    if (!enrollment) return NextResponse.json({ error: 'Nie znaleziono zapisu' }, { status: 404 })
    const { data: payment } = await db.from('training_commerce_payments')
      .select('id, status').eq('enrollment_id', enrollment.id).maybeSingle()
    try {
      if (payment?.status === 'completed') {
        if (!result.access.can('refunds.manage')) return NextResponse.json({ error: 'Brak uprawnienia do zwrotów' }, { status: 403 })
        await createTrainingCommerceRefund(payment.id, user.id, typeof body.reason === 'string' ? body.reason : 'Anulowanie zapisu przez trenera')
      } else {
        if (payment?.status === 'pending') await cancelTrainingCommerceCheckout(payment.id)
        await db.from('training_course_enrollments').update({
          status: 'cancelled', payment_status: enrollment.payment_status === 'pending' ? 'unpaid' : enrollment.payment_status,
          cancellation_reason: typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null,
          cancelled_at: new Date().toISOString(), expires_at: null,
        }).eq('id', enrollment.id)
      }
      const { data: promoted } = await db.rpc('promote_training_course_waitlist', { target_course_id: id })
      const promotedEnrollment = Array.isArray(promoted) ? promoted[0] : promoted
      await notifyTrainingEnrollment(enrollment.id, 'cancelled')
      if (promotedEnrollment?.id) await notifyTrainingEnrollment(promotedEnrollment.id, 'promoted')
      return NextResponse.json({ cancelled: true, promoted: promotedEnrollment ?? null })
    } catch (caught) {
      return NextResponse.json({ error: caught instanceof Error ? caught.message : 'Nie udało się anulować zapisu' }, { status: 409 })
    }
  }

  if (body.action === 'session') {
    const operation = String(body.operation ?? '')
    if (operation === 'add') {
      const startsAt = new Date(String(body.startsAt ?? ''))
      const durationMin = Number(body.durationMin ?? 60)
      if (Number.isNaN(startsAt.getTime()) || !Number.isInteger(durationMin) || durationMin < 15 || durationMin > 480) {
        return NextResponse.json({ error: 'Nieprawidłowy termin lub czas zajęć' }, { status: 400 })
      }
      const { data, error } = await db.from('training_course_sessions').insert({ course_id: id, starts_at: startsAt.toISOString(), duration_min: durationMin }).select().single()
      if (error) return NextResponse.json({ error: 'Nie udało się dodać terminu' }, { status: 500 })
      return NextResponse.json(data, { status: 201 })
    }
    if (typeof body.sessionId !== 'string') return NextResponse.json({ error: 'Brak terminu' }, { status: 400 })
    const { data: session } = await db.from('training_course_sessions').select('id, starts_at, duration_min, status').eq('id', body.sessionId).eq('course_id', id).maybeSingle()
    if (!session) return NextResponse.json({ error: 'Nie znaleziono terminu' }, { status: 404 })
    if (operation === 'cancel') {
      const { data, error } = await db.from('training_course_sessions').update({ status: 'cancelled', cancellation_reason: typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null }).eq('id', session.id).select().single()
      if (error) return NextResponse.json({ error: 'Nie udało się anulować zajęć' }, { status: 500 })
      await notifyTrainingCourseParticipants(id, 'Termin zajęć został anulowany', `${course.name}: zajęcia ${new Date(session.starts_at).toLocaleString('pl-PL')} zostały anulowane.`)
      return NextResponse.json(data)
    }
    if (operation === 'update') {
      const startsAt = new Date(String(body.startsAt ?? session.starts_at))
      const durationMin = Number(body.durationMin ?? session.duration_min)
      if (Number.isNaN(startsAt.getTime()) || !Number.isInteger(durationMin) || durationMin < 15 || durationMin > 480) return NextResponse.json({ error: 'Nieprawidłowy termin' }, { status: 400 })
      const { data, error } = await db.from('training_course_sessions').update({ starts_at: startsAt.toISOString(), duration_min: durationMin }).eq('id', session.id).select().single()
      if (error) return NextResponse.json({ error: 'Nie udało się zmienić terminu' }, { status: 500 })
      await notifyTrainingCourseParticipants(id, 'Zmiana terminu zajęć', `${course.name}: nowy termin to ${startsAt.toLocaleString('pl-PL')}.`)
      return NextResponse.json(data)
    }
    return NextResponse.json({ error: 'Nieprawidłowa operacja na terminie' }, { status: 400 })
  }

  if (body.action === 'cancel_course') {
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 1000) : 'Kurs został anulowany przez trenera'
    const { data: enrollments } = await db.from('training_course_enrollments').select('id, payment_status, training_commerce_payments(id, status)').eq('course_id', id).in('status', ['pending', 'confirmed', 'waitlisted'])
    const requiresRefund = (enrollments ?? []).some(enrollment => {
      const payment = Array.isArray(enrollment.training_commerce_payments) ? enrollment.training_commerce_payments[0] : enrollment.training_commerce_payments
      return payment?.status === 'completed'
    })
    if (requiresRefund && !result.access.can('refunds.manage')) return NextResponse.json({ error: 'Anulowanie płatnego kursu wymaga uprawnienia do zwrotów' }, { status: 403 })
    await notifyTrainingCourseParticipants(id, 'Kurs został anulowany', `${course.name}: ${reason}`)
    await Promise.all([
      db.from('training_courses').update({ status: 'cancelled', cancellation_reason: reason, cancelled_at: new Date().toISOString() }).eq('id', id),
      db.from('training_course_sessions').update({ status: 'cancelled', cancellation_reason: reason }).eq('course_id', id).eq('status', 'scheduled'),
    ])
    const failures: string[] = []
    for (const enrollment of enrollments ?? []) {
      const payment = Array.isArray(enrollment.training_commerce_payments) ? enrollment.training_commerce_payments[0] : enrollment.training_commerce_payments
      try {
        if (payment?.status === 'completed') {
          if (!result.access.can('refunds.manage')) { failures.push(enrollment.id); continue }
          await createTrainingCommerceRefund(payment.id, user.id, reason)
        }
        else {
          if (payment?.status === 'pending') await cancelTrainingCommerceCheckout(payment.id)
          await db.from('training_course_enrollments').update({ status: 'cancelled', cancellation_reason: reason, cancelled_at: new Date().toISOString(), expires_at: null }).eq('id', enrollment.id)
        }
      } catch { failures.push(enrollment.id) }
    }
    return NextResponse.json({ cancelled: true, refundFailures: failures })
  }

  if (body.action === 'attendance') {
    if (typeof body.sessionId !== 'string' || typeof body.enrollmentId !== 'string' || !['present', 'absent', 'excused', 'make_up'].includes(String(body.status))) {
      return NextResponse.json({ error: 'Nieprawidłowa obecność' }, { status: 400 })
    }
    const { data: session } = await db.from('training_course_sessions').select('id').eq('id', body.sessionId).eq('course_id', id).maybeSingle()
    if (!session) return NextResponse.json({ error: 'Termin nie należy do kursu' }, { status: 400 })
    let makeUpForSessionId: string | null = null
    if (body.status === 'make_up') {
      if (typeof body.makeUpForSessionId !== 'string') return NextResponse.json({ error: 'Wskaż nieobecność odrabianą na tym spotkaniu' }, { status: 400 })
      const [{ data: original }, { count: usedMakeUps }] = await Promise.all([
        db.from('training_course_attendance').select('id, training_course_sessions!inner(course_id)').eq('session_id', body.makeUpForSessionId).eq('enrollment_id', body.enrollmentId).in('status', ['absent', 'excused']).maybeSingle(),
        db.from('training_course_attendance').select('id', { count: 'exact', head: true }).eq('enrollment_id', body.enrollmentId).eq('status', 'make_up'),
      ])
      const originalSession = Array.isArray(original?.training_course_sessions) ? original?.training_course_sessions[0] : original?.training_course_sessions
      if (!original || originalSession?.course_id !== id) return NextResponse.json({ error: 'Nie znaleziono nieobecności do odrobienia' }, { status: 400 })
      if ((usedMakeUps ?? 0) >= course.make_up_limit) return NextResponse.json({ error: 'Wykorzystano limit odrabiania dla tego kursu' }, { status: 409 })
      makeUpForSessionId = body.makeUpForSessionId
    }
    let consumedPass = false
    if (body.consumePass === true && (body.status === 'present' || body.status === 'make_up')) {
      if (!result.access.can('passes.manage')) return NextResponse.json({ error: 'Rozliczenie wejścia wymaga uprawnienia do karnetów' }, { status: 403 })
      const { data: enrollment } = await db.from('training_course_enrollments').select('id, user_id, dog_id').eq('id', body.enrollmentId).eq('course_id', id).maybeSingle()
      if (!enrollment?.dog_id) return NextResponse.json({ error: 'Zapis nie ma psa przypisanego do karnetu' }, { status: 409 })
      const { data: passes } = await db.from('training_passes').select('id, expires_at, training_pass_products!inner(trainer_id, training_type_id)').eq('user_id', enrollment.user_id).eq('dog_id', enrollment.dog_id).eq('status', 'active').gt('entries_remaining', 0)
      const pass = (passes ?? []).find(candidate => {
        const product = Array.isArray(candidate.training_pass_products) ? candidate.training_pass_products[0] : candidate.training_pass_products
        return product?.trainer_id === result.access.profile.owner_id && (!product.training_type_id || product.training_type_id === course.training_type_id)
          && (!candidate.expires_at || candidate.expires_at >= new Date().toISOString().slice(0, 10))
      })
      if (!pass) return NextResponse.json({ error: 'Brak aktywnego karnetu pasującego do tych zajęć' }, { status: 409 })
      const { error: consumeError } = await db.rpc('consume_training_pass_for_course_session', { target_pass_id: pass.id, target_session_id: body.sessionId, target_enrollment_id: body.enrollmentId, target_trainer_id: result.access.profile.owner_id })
      if (consumeError) return NextResponse.json({ error: 'Nie udało się rozliczyć wejścia z karnetu' }, { status: 409 })
      consumedPass = true
    }
    if (body.status === 'absent' || body.status === 'excused') {
      await db.rpc('reverse_training_pass_session_usage', { target_session_id: body.sessionId, target_enrollment_id: body.enrollmentId })
    }
    const { data, error } = await db.from('training_course_attendance').upsert({
      session_id: body.sessionId,
      enrollment_id: body.enrollmentId,
      status: body.status,
      make_up_for_session_id: makeUpForSessionId,
      checked_by: user.id,
      checked_at: new Date().toISOString(),
    }, { onConflict: 'session_id,enrollment_id' }).select().single()
    if (error) {
      if (consumedPass) await db.rpc('reverse_training_pass_session_usage', { target_session_id: body.sessionId, target_enrollment_id: body.enrollmentId })
      return NextResponse.json({ error: 'Nie udało się zapisać obecności' }, { status: 500 })
    }
    return NextResponse.json({ ...data, passConsumed: consumedPass })
  }

  const update: Record<string, unknown> = {}
  if (['draft', 'published', 'archived'].includes(String(body.status))) update.status = body.status
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim().slice(0, 120)
  if (typeof body.capacity === 'number' && Number.isInteger(body.capacity) && body.capacity >= 1 && body.capacity <= 100) {
    const { count } = await db.from('training_course_enrollments').select('id', { count: 'exact', head: true }).eq('course_id', id).in('status', ['pending', 'confirmed'])
    if (body.capacity < (count ?? 0)) return NextResponse.json({ error: 'Limit nie może być mniejszy od liczby aktywnych zapisów' }, { status: 409 })
    update.capacity = body.capacity
  }
  if (typeof body.description === 'string') update.description = body.description.trim().slice(0, 3000) || null
  if (typeof body.location === 'string') update.location = body.location.trim().slice(0, 300) || null
  if (typeof body.cancellationPolicy === 'string') update.cancellation_policy = body.cancellationPolicy.trim().slice(0, 3000) || null
  if (typeof body.participantMessage === 'string') update.participant_message = body.participantMessage.trim().slice(0, 2000) || null
  if (body.enrollmentMode === 'open' || body.enrollmentMode === 'approval') update.enrollment_mode = body.enrollmentMode
  if (typeof body.makeUpLimit === 'number' && Number.isInteger(body.makeUpLimit) && body.makeUpLimit >= 0 && body.makeUpLimit <= 20) update.make_up_limit = body.makeUpLimit
  if (typeof body.price === 'number' && Number.isFinite(body.price) && body.price >= 0 && body.price <= 100000) {
    const { count } = await db.from('training_course_enrollments').select('id', { count: 'exact', head: true }).eq('course_id', id).neq('status', 'cancelled')
    if ((count ?? 0) > 0) return NextResponse.json({ error: 'Nie można zmienić ceny po rozpoczęciu zapisów' }, { status: 409 })
    update.price = body.price
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Brak zmian do zapisania' }, { status: 400 })
  const { data, error } = await db.from('training_courses').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Nie udało się zaktualizować kursu' }, { status: 500 })
  return NextResponse.json(data)
}
