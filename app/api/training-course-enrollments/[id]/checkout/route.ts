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
  const { data: enrollment, error } = await db.from('training_course_enrollments')
    .select('id, user_id, status, payment_status, approved_at, training_courses!inner(id, trainer_id, name, price, currency)')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Nie udało się sprawdzić zapisu' }, { status: 500 })
  if (!enrollment) return NextResponse.json({ error: 'Nie znaleziono zapisu' }, { status: 404 })
  const course = Array.isArray(enrollment.training_courses) ? enrollment.training_courses[0] : enrollment.training_courses
  if (!course || enrollment.status !== 'pending' || !enrollment.approved_at || Number(course.price) <= 0) {
    return NextResponse.json({ error: 'Ten zapis nie oczekuje na płatność online' }, { status: 409 })
  }
  try {
    const checkout = await createTrainingCommerceCheckout(req, {
      kind: 'course', entityId: enrollment.id, userId: user.id,
      trainerId: course.trainer_id, customerEmail: user.email,
      name: course.name, description: `Udział w kursie ${course.name}`,
      amount: Number(course.price), currency: course.currency,
    })
    return NextResponse.json(checkout)
  } catch (checkoutError) {
    const message = checkoutError instanceof Error ? checkoutError.message : 'Nie udało się rozpocząć płatności'
    const status = checkoutError instanceof TrainingCommerceError ? checkoutError.status : 502
    return NextResponse.json({ error: message }, { status })
  }
}
