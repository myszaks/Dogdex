import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser, canManageTrainerResource } from '@/lib/getServerUser'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const trainerSlug = searchParams.get('trainer')
  const supabase = await createAuthClient()

  let query = supabase
    .from('training_types')
    .select('*, training_availability(*)')

  if (trainerSlug) {
    const { data: trainer } = await supabase
      .from('trainer_profiles')
      .select('trainer_id')
      .eq('slug', trainerSlug)
      .maybeSingle()

    if (!trainer) return NextResponse.json({ error: 'Nie znaleziono trenera' }, { status: 404 })

    query = query.eq('trainer_id', trainer.trainer_id).eq('slug', id)
  } else {
    query = query.eq('id', id)
  }

  const { data, error } = await query.maybeSingle()

  if (error) return NextResponse.json({ error: 'Nie udało się pobrać typu treningu' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: Params) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { id } = await params
  const supabase = await createAuthClient()
  const { data: type, error: typeError } = await supabase
    .from('training_types')
    .select('trainer_id')
    .eq('id', id)
    .maybeSingle()

  if (typeError) {
    return NextResponse.json({ error: 'Nie udało się sprawdzić typu treningu' }, { status: 500 })
  }
  if (!type) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  if (!canManageTrainerResource(user.id, type.trainer_id, role)) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) {
      return NextResponse.json({ error: 'Nazwa musi mieć od 1 do 120 znaków' }, { status: 400 })
    }
    updates.name = body.name.trim()
  }
  if ('description' in body) {
    if (body.description != null && (
      typeof body.description !== 'string'
      || body.description.length > 2000
    )) {
      return NextResponse.json({ error: 'Opis może mieć maksymalnie 2000 znaków' }, { status: 400 })
    }
    updates.description = typeof body.description === 'string'
      ? body.description.trim() || null
      : null
  }
  if ('price_per_hour' in body) {
    if (body.price_per_hour != null && (
      typeof body.price_per_hour !== 'number'
      || !Number.isFinite(body.price_per_hour)
      || body.price_per_hour < 0
      || body.price_per_hour > 100_000
    )) {
      return NextResponse.json({ error: 'Nieprawidłowa cena treningu' }, { status: 400 })
    }
    updates.price_per_hour = body.price_per_hour
  }
  if ('duration_min' in body) {
    if (
      typeof body.duration_min !== 'number'
      || !Number.isInteger(body.duration_min)
      || body.duration_min < 15
      || body.duration_min > 480
    ) {
      return NextResponse.json({ error: 'Czas treningu musi wynosić od 15 do 480 minut' }, { status: 400 })
    }
    updates.duration_min = body.duration_min
  }
  if ('is_active' in body) {
    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'Nieprawidłowy status typu treningu' }, { status: 400 })
    }
    updates.is_active = body.is_active
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Brak pól do aktualizacji' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('training_types')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Nie udało się zaktualizować typu treningu' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const { id } = await params
  const supabase = await createAuthClient()

  // Verify ownership or admin
  const { data: type } = await supabase
    .from('training_types')
    .select('trainer_id')
    .eq('id', id)
    .single()

  if (!type || !canManageTrainerResource(user.id, type.trainer_id, role)) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const { error } = await supabase
    .from('training_types')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Nie udało się wyłączyć typu treningu' }, { status: 500 })
  return NextResponse.json({ success: true })
}
