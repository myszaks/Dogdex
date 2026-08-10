import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient } from '@/lib/supabaseServer'
import { toSlug } from '@/lib/utils'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'

async function uniqueSlug(db: ReturnType<typeof createServerClient>, businessProfileId: string, name: string) {
  const base = toSlug(name) || 'kurs'
  let slug = base
  let suffix = 2
  while (true) {
    const { data } = await db.from('training_courses').select('id').eq('business_profile_id', businessProfileId).eq('slug', slug).maybeSingle()
    if (!data) return slug
    slug = `${base}-${suffix++}`
  }
}

export async function GET(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  const db = createServerClient()
  const url = new URL(req.url)
  const mine = url.searchParams.get('mine') === '1'
  if (mine) {
    const { data, error } = await db.from('training_course_enrollments')
      .select(`
        *, dogs(id, name),
        training_courses(*, training_course_sessions(*)),
        training_course_attendance(*, training_course_sessions!training_course_attendance_session_id_fkey(starts_at)),
        training_commerce_payments(
          id, status, amount, currency, refunded_amount, receipt_url, completed_at, created_at,
          training_commerce_refunds(id, status, amount, reason, error_message, created_at, updated_at)
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: 'Nie udało się pobrać kursów' }, { status: 500 })
    return NextResponse.json({ enrollments: data ?? [] })
  }
  const result = await requireBusinessProfileAccessForApi(url.searchParams.get('profileId'), ['trainings.offer', 'trainings.schedule', 'trainings.attendance', 'customers.view'])
  if ('error' in result) return result.error
  const includeCustomers = result.access.can('customers.view') || result.access.can('trainings.attendance')
  const courseQuery = includeCustomers
    ? db.from('training_courses').select('*, training_course_sessions(*), training_course_enrollments(*, dogs(id, name))')
    : db.from('training_courses').select('*, training_course_sessions(*)')
  const { data, error } = await courseQuery.eq('business_profile_id', result.access.profile.id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Nie udało się pobrać kursów' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 }) }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const sessionStarts = Array.isArray(body.sessionStarts) ? body.sessionStarts : []
  const capacity = Number(body.capacity ?? 8)
  const durationMin = Number(body.durationMin ?? 60)
  const price = Number(body.price ?? 0)
  const result = await requireBusinessProfileAccessForApi(typeof body.businessProfileId === 'string' ? body.businessProfileId : null, 'trainings.offer')
  if ('error' in result) return result.error
  if (!name || name.length > 120) return NextResponse.json({ error: 'Podaj nazwę kursu' }, { status: 400 })
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return NextResponse.json({ error: 'Limit grupy musi wynosić 1–100' }, { status: 400 })
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 480) return NextResponse.json({ error: 'Czas zajęć musi wynosić 15–480 minut' }, { status: 400 })
  if (!Number.isFinite(price) || price < 0 || price > 100000) return NextResponse.json({ error: 'Nieprawidłowa cena kursu' }, { status: 400 })
  const dates = sessionStarts.map(value => new Date(String(value))).filter(value => !Number.isNaN(value.getTime()))
  if (dates.length === 0 || dates.length > 100) return NextResponse.json({ error: 'Dodaj od 1 do 100 terminów zajęć' }, { status: 400 })
  const db = createServerClient()
  const trainingTypeId = typeof body.trainingTypeId === 'string' && body.trainingTypeId ? body.trainingTypeId : null
  if (trainingTypeId) {
    const { data: ownedType } = await db.from('training_types').select('id').eq('id', trainingTypeId).eq('business_profile_id', result.access.profile.id).maybeSingle()
    if (!ownedType) return NextResponse.json({ error: 'Wybrany rodzaj treningu nie należy do tego profilu' }, { status: 400 })
  }
  const slug = await uniqueSlug(db, result.access.profile.id, name)
  const { data: course, error } = await db.from('training_courses').insert({
    trainer_id: result.access.profile.owner_id,
    business_profile_id: result.access.profile.id,
    training_type_id: trainingTypeId,
    slug,
    name,
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 3000) || null : null,
    location: typeof body.location === 'string' ? body.location.trim().slice(0, 300) || null : null,
    cancellation_policy: typeof body.cancellationPolicy === 'string' ? body.cancellationPolicy.trim().slice(0, 3000) || null : null,
    participant_message: typeof body.participantMessage === 'string' ? body.participantMessage.trim().slice(0, 2000) || null : null,
    capacity,
    price,
    enrollment_mode: body.enrollmentMode === 'approval' ? 'approval' : 'open',
    status: body.status === 'published' ? 'published' : 'draft',
    make_up_limit: Number.isInteger(body.makeUpLimit) ? Math.min(20, Math.max(0, Number(body.makeUpLimit))) : 1,
  }).select().single()
  if (error || !course) return NextResponse.json({ error: 'Nie udało się utworzyć kursu' }, { status: 500 })
  const { error: sessionsError } = await db.from('training_course_sessions').insert(dates.map(startsAt => ({
    course_id: course.id,
    starts_at: startsAt.toISOString(),
    duration_min: durationMin,
  })))
  if (sessionsError) {
    await db.from('training_courses').delete().eq('id', course.id)
    return NextResponse.json({ error: 'Nie udało się zapisać terminów kursu' }, { status: 500 })
  }
  const { data } = await db.from('training_courses').select('*, training_course_sessions(*)').eq('id', course.id).single()
  return NextResponse.json(data, { status: 201 })
}
