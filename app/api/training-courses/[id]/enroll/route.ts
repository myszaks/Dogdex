import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { createTrainingCommerceCheckout, TrainingCommerceError } from '@/lib/trainingCommerceCheckout'
import { notifyTrainingEnrollment } from '@/lib/trainingCommerceNotifications'

interface Params { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Zaloguj się, aby zapisać psa' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji serwera płatności' }, { status: 503 })

  let body: { dogId?: string; notes?: string; policyAccepted?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }
  if (!body.dogId) return NextResponse.json({ error: 'Wybierz psa z profilu' }, { status: 400 })

  const db = createServerClient()
  const [{ data: course }, { data: dog }] = await Promise.all([
    db.from('training_courses').select('id, trainer_id, name, status, price, currency, enrollment_mode, cancellation_policy').eq('id', id).maybeSingle(),
    db.from('dogs').select('id').eq('id', body.dogId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!course || course.status !== 'published') return NextResponse.json({ error: 'Zapisy na ten kurs są niedostępne' }, { status: 409 })
  if (!dog) return NextResponse.json({ error: 'Nieprawidłowy pies' }, { status: 403 })
  if (course.cancellation_policy && body.policyAccepted !== true) return NextResponse.json({ error: 'Zaakceptuj zasady rezygnacji i zwrotów' }, { status: 400 })

  await db.rpc('reconcile_training_commerce_states')
  const { data, error } = await db.rpc('create_training_course_enrollment', {
    target_course_id: id,
    target_user_id: user.id,
    target_dog_id: dog.id,
    target_notes: typeof body.notes === 'string' ? body.notes : '',
  })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ten pies jest już zapisany na kurs' }, { status: 409 })
    console.error('[training-courses] Enrollment failed:', error)
    return NextResponse.json({ error: 'Nie udało się zapisać na kurs' }, { status: 500 })
  }
  const enrollment = Array.isArray(data) ? data[0] : data
  if (!enrollment) return NextResponse.json({ error: 'Nie udało się zapisać na kurs' }, { status: 500 })
  if (course.cancellation_policy) {
    const { error: policyError } = await db.from('training_course_enrollments').update({
      policy_accepted_at: new Date().toISOString(),
      policy_snapshot: course.cancellation_policy,
    }).eq('id', enrollment.id)
    if (policyError) {
      await db.from('training_course_enrollments').update({ status: 'cancelled' }).eq('id', enrollment.id)
      return NextResponse.json({ error: 'Nie udało się zapisać akceptacji zasad' }, { status: 500 })
    }
  }
  if (enrollment.status === 'waitlisted' || course.enrollment_mode === 'approval') {
    await notifyTrainingEnrollment(enrollment.id, 'joined')
  }

  if (Number(course.price) > 0 && course.enrollment_mode === 'open' && enrollment.status === 'pending') {
    try {
      const checkout = await createTrainingCommerceCheckout(req, {
        kind: 'course', entityId: enrollment.id, userId: user.id,
        trainerId: course.trainer_id, customerEmail: user.email,
        name: course.name, description: `Udział w kursie ${course.name}`,
        amount: Number(course.price), currency: course.currency,
      })
      return NextResponse.json({ ...enrollment, checkoutUrl: checkout.checkoutUrl }, { status: 201 })
    } catch (checkoutError) {
      const message = checkoutError instanceof Error ? checkoutError.message : 'Nie udało się rozpocząć płatności'
      const status = checkoutError instanceof TrainingCommerceError ? checkoutError.status : 502
      return NextResponse.json({ error: message }, { status })
    }
  }

  return NextResponse.json(enrollment, { status: 201 })
}
