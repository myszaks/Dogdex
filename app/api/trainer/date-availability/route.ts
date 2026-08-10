import { NextRequest, NextResponse } from 'next/server'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'
import { createServerClient } from '@/lib/supabaseServer'
import { isValidTrainingDate, isValidTrainingTimeRange } from '@/lib/trainingAvailability'
import { getBookingDateTimeParts } from '@/lib/trainingBooking'

export async function GET() {
  const result = await requireBusinessProfileAccessForApi(null, 'trainings.schedule')
  if ('error' in result) return result.error
  const { data, error } = await createServerClient()
    .from('trainer_date_availability')
    .select('*')
    .eq('business_profile_id', result.access.profile.id)
    .eq('is_active', true)
    .order('available_date', { ascending: true })
  if (error) return NextResponse.json({ error: 'Nie udało się pobrać dostępności' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const result = await requireBusinessProfileAccessForApi(null, 'trainings.schedule')
  if ('error' in result) return result.error
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }
  const { available_date, start_time, end_time } = body
  if (!isValidTrainingDate(available_date) || available_date < getBookingDateTimeParts(new Date()).date) {
    return NextResponse.json({ error: 'Nieprawidłowa data' }, { status: 400 })
  }
  if (!isValidTrainingTimeRange(start_time, end_time)) return NextResponse.json({ error: 'Nieprawidłowy zakres godzin' }, { status: 400 })
  const { data, error } = await createServerClient().from('trainer_date_availability').insert([{
    trainer_id: result.access.profile.owner_id,
    business_profile_id: result.access.profile.id,
    available_date,
    start_time,
    end_time,
    is_active: true,
  }]).select().single()
  if (error?.message?.includes('trainer_date_availability_conflict')) return NextResponse.json({ error: 'Ten przedział nachodzi na istniejącą dostępność' }, { status: 409 })
  if (error?.code === '23505') return NextResponse.json({ error: 'Taki przedział już istnieje' }, { status: 409 })
  if (error) return NextResponse.json({ error: 'Nie udało się zapisać dostępności' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }
  const { id, start_time, end_time } = body
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'Brakuje identyfikatora' }, { status: 400 })
  if (!isValidTrainingTimeRange(start_time, end_time)) return NextResponse.json({ error: 'Nieprawidłowy zakres godzin' }, { status: 400 })
  const db = createServerClient()
  const { data: slot } = await db.from('trainer_date_availability').select('id, business_profile_id').eq('id', id).maybeSingle()
  if (!slot) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  const result = await requireBusinessProfileAccessForApi(slot.business_profile_id, 'trainings.schedule')
  if ('error' in result) return result.error
  const { data, error } = await db.from('trainer_date_availability').update({ start_time, end_time, is_active: true, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error?.message?.includes('trainer_date_availability_conflict')) return NextResponse.json({ error: 'Ten przedział nachodzi na istniejącą dostępność' }, { status: 409 })
  if (error) return NextResponse.json({ error: 'Nie udało się zaktualizować dostępności' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }
  const { id } = body
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'Brakuje identyfikatora' }, { status: 400 })
  const db = createServerClient()
  const { data: slot } = await db.from('trainer_date_availability').select('id, business_profile_id').eq('id', id).maybeSingle()
  if (!slot) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  const result = await requireBusinessProfileAccessForApi(slot.business_profile_id, 'trainings.schedule')
  if ('error' in result) return result.error
  const { error } = await db.from('trainer_date_availability').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Nie udało się usunąć dostępności' }, { status: 500 })
  return NextResponse.json({ success: true })
}
