import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser, canManageTrainerResource } from '@/lib/getServerUser'

export async function POST(req: Request) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { training_type_id, day_of_week, start_time, end_time, is_active } = body

  // Validate training_type ownership or admin
  const supabase = await createAuthClient()
  const { data: trainingType } = await supabase
    .from('training_types')
    .select('trainer_id')
    .eq('id', training_type_id)
    .single()

  if (!trainingType || !canManageTrainerResource(user.id, trainingType.trainer_id, role)) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  // Validate time inputs
  if (!day_of_week || typeof day_of_week !== 'number' || day_of_week < 0 || day_of_week > 6) {
    return NextResponse.json({ error: 'Nieprawidłowy dzień tygodnia (0-6)' }, { status: 400 })
  }

  if (!start_time || !end_time) {
    return NextResponse.json({ error: 'Godziny rozpoczęcia i zakończenia są wymagane' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('training_availability')
    .insert([{
      training_type_id,
      day_of_week,
      start_time,
      end_time,
      is_active: typeof is_active === 'boolean' ? is_active : true,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: Request) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Brakuje ID dostępności' }, { status: 400 })
  }

  const supabase = await createAuthClient()

  // Verify ownership or admin
  const { data: availability } = await supabase
    .from('training_availability')
    .select('training_type_id, training_types(trainer_id)')
    .eq('id', id)
    .single()

  if (!availability || (Array.isArray(availability.training_types) && availability.training_types.length === 0)) {
    return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  }

  const trainerId = Array.isArray(availability.training_types) 
    ? (availability.training_types as any[])[0]?.trainer_id 
    : (availability.training_types as any)?.trainer_id

  if (!canManageTrainerResource(user.id, trainerId, role)) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const { error } = await supabase
    .from('training_availability')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
