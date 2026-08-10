import { createServerClient } from '@/lib/supabaseServer'
import { sendTrainingCommerceStatusEmail } from '@/lib/email'

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export async function notifyTrainingCommercePaymentCompleted(paymentId: string) {
  const db = createServerClient()
  const { data: claimed } = await db.from('training_commerce_payments')
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq('id', paymentId).is('confirmation_sent_at', null).select('id').maybeSingle()
  if (!claimed) return
  const { data: payment } = await db.from('training_commerce_payments').select(`
    user_id, enrollment_id, pass_id,
    training_course_enrollments(training_courses(name)),
    training_passes(training_pass_products(name))
  `).eq('id', paymentId).maybeSingle()
  if (!payment) return
  const { data: customer } = await db.auth.admin.getUserById(payment.user_id)
  if (!customer.user?.email) return
  const enrollment = one(payment.training_course_enrollments)
  const pass = one(payment.training_passes)
  const course = one(enrollment?.training_courses)
  const product = one(pass?.training_pass_products)
  const label = course?.name ?? product?.name ?? 'zakup'
  await sendTrainingCommerceStatusEmail({
    to: customer.user.email,
    title: payment.enrollment_id ? 'Miejsce na kursie potwierdzone' : 'Karnet jest aktywny',
    message: `Płatność za „${label}” została potwierdzona przez Stripe.`,
    actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''}/moje-zapisy?tab=trainings`,
  })
}

export async function notifyTrainingEnrollment(enrollmentId: string, kind: 'joined' | 'approved' | 'promoted' | 'cancelled') {
  const db = createServerClient()
  const { data: enrollment } = await db.from('training_course_enrollments')
    .select('user_id, status, waitlist_position, training_courses(name, price)')
    .eq('id', enrollmentId).maybeSingle()
  if (!enrollment) return
  const course = one(enrollment.training_courses)
  const { data: customer } = await db.auth.admin.getUserById(enrollment.user_id)
  if (!customer.user?.email || !course) return
  const copy = kind === 'joined'
    ? enrollment.status === 'waitlisted'
      ? { title: 'Dodano do listy rezerwowej', message: `Jesteś na pozycji ${enrollment.waitlist_position ?? '—'} kursu „${course.name}”.` }
      : { title: 'Zgłoszenie na kurs zapisane', message: `Zgłoszenie na kurs „${course.name}” oczekuje na decyzję trenera.` }
    : kind === 'approved'
      ? { title: 'Trener zaakceptował zgłoszenie', message: Number(course.price) > 0 ? `Miejsce na kursie „${course.name}” czeka na płatność.` : `Miejsce na kursie „${course.name}” jest potwierdzone.` }
      : kind === 'promoted'
        ? { title: 'Zwolniło się miejsce na kursie', message: `Możesz potwierdzić udział w kursie „${course.name}”.` }
        : { title: 'Zapis na kurs został anulowany', message: `Zapis na kurs „${course.name}” nie jest już aktywny.` }
  await sendTrainingCommerceStatusEmail({
    to: customer.user.email,
    ...copy,
    actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''}/moje-zapisy?tab=trainings`,
  })
}

export async function notifyTrainingCourseParticipants(courseId: string, title: string, message: string) {
  const db = createServerClient()
  const { data: enrollments } = await db.from('training_course_enrollments')
    .select('user_id').eq('course_id', courseId).in('status', ['pending', 'confirmed'])
  await Promise.all((enrollments ?? []).map(async enrollment => {
    const { data: customer } = await db.auth.admin.getUserById(enrollment.user_id)
    if (customer.user?.email) await sendTrainingCommerceStatusEmail({
      to: customer.user.email, title, message,
      actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''}/moje-zapisy?tab=trainings`,
    })
  }))
}

export async function notifyExpiringTrainingPasses() {
  const db = createServerClient()
  const today = new Date()
  const limit = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10)
  const { data: passes } = await db.from('training_passes')
    .select('id, user_id, expires_at, entries_remaining, training_pass_products(name)')
    .eq('status', 'active').gt('entries_remaining', 0).lte('expires_at', limit)
    .is('expiry_notification_sent_at', null)
  let sent = 0
  for (const pass of passes ?? []) {
    const { data: claimed } = await db.from('training_passes').update({ expiry_notification_sent_at: new Date().toISOString() })
      .eq('id', pass.id).is('expiry_notification_sent_at', null).select('id').maybeSingle()
    if (!claimed) continue
    const { data: customer } = await db.auth.admin.getUserById(pass.user_id)
    const product = one(pass.training_pass_products)
    if (customer.user?.email) {
      await sendTrainingCommerceStatusEmail({
        to: customer.user.email,
        title: 'Karnet wkrótce straci ważność',
        message: `${product?.name ?? 'Karnet'} jest ważny do ${pass.expires_at}. Pozostało ${pass.entries_remaining} wejść.`,
        actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''}/moje-zapisy?tab=trainings`,
      })
      sent += 1
    }
  }
  return sent
}
