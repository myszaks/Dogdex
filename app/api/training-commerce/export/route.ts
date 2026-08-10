import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'

function csv(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export async function GET(req: Request) {
  const result = await requireBusinessProfileAccessForApi(new URL(req.url).searchParams.get('profileId'), 'payments.view')
  if ('error' in result) return result.error
  const db = createServerClient()
  const { data, error } = await db.from('training_commerce_payments').select(`
    id, created_at, completed_at, amount, currency, refunded_amount, status, user_id,
    training_course_enrollments(dogs(name), training_courses(name)),
    training_passes(dogs(name), training_pass_products(name))
  `).eq('business_profile_id', result.access.profile.id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Nie udało się przygotować raportu' }, { status: 500 })
  const rows = (data ?? []).map(payment => {
    const enrollment = Array.isArray(payment.training_course_enrollments) ? payment.training_course_enrollments[0] : payment.training_course_enrollments
    const pass = Array.isArray(payment.training_passes) ? payment.training_passes[0] : payment.training_passes
    const course = Array.isArray(enrollment?.training_courses) ? enrollment?.training_courses[0] : enrollment?.training_courses
    const product = Array.isArray(pass?.training_pass_products) ? pass?.training_pass_products[0] : pass?.training_pass_products
    const dog = Array.isArray(enrollment?.dogs) ? enrollment?.dogs[0] : enrollment?.dogs
    const passDog = Array.isArray(pass?.dogs) ? pass?.dogs[0] : pass?.dogs
    return [payment.id, payment.created_at, payment.completed_at, course ? 'kurs' : 'karnet', course?.name ?? product?.name, dog?.name ?? passDog?.name, payment.amount, payment.currency, payment.refunded_amount, payment.status]
  })
  const header = ['id', 'utworzono', 'opłacono', 'typ', 'oferta', 'pies', 'kwota', 'waluta', 'zwrócono', 'status']
  const content = '\uFEFF' + [header, ...rows].map(row => row.map(csv).join(';')).join('\r\n')
  return new NextResponse(content, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="sprzedaz-kursy-karnety.csv"' } })
}
