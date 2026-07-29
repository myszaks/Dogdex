import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { toSlug } from '@/lib/utils'
import { isTrainerRole } from '@/lib/roles'
import type { SupabaseClient } from '@supabase/supabase-js'

async function generateTrainingTypeSlug(
  supabase: SupabaseClient,
  trainerId: string,
  name: string,
): Promise<string> {
  const base = toSlug(name) || 'trening'
  let slug = base
  let i = 2

  while (true) {
    const { data } = await supabase
      .from('training_types')
      .select('id')
      .eq('trainer_id', trainerId)
      .eq('slug', slug)
      .maybeSingle()

    if (!data) return slug
    slug = `${base}-${i++}`
  }
}

export async function GET() {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!isTrainerRole(role)) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('training_types')
    .select('*')
    .eq('trainer_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Nie udało się pobrać typów treningów' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  if (!isTrainerRole(role)) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { name, description, price_per_hour, duration_min, is_active } = body

  if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    return NextResponse.json({ error: 'Nazwa typu treningu jest wymagana' }, { status: 400 })
  }
  if (description != null && (typeof description !== 'string' || description.length > 2000)) {
    return NextResponse.json({ error: 'Opis może mieć maksymalnie 2000 znaków' }, { status: 400 })
  }
  if (
    price_per_hour != null
    && (
      typeof price_per_hour !== 'number'
      || !Number.isFinite(price_per_hour)
      || price_per_hour < 0
      || price_per_hour > 100_000
    )
  ) {
    return NextResponse.json({ error: 'Nieprawidłowa cena treningu' }, { status: 400 })
  }
  if (
    duration_min != null
    && (
      typeof duration_min !== 'number'
      || !Number.isInteger(duration_min)
      || duration_min < 15
      || duration_min > 480
    )
  ) {
    return NextResponse.json({ error: 'Czas treningu musi wynosić od 15 do 480 minut' }, { status: 400 })
  }

  const supabase = await createAuthClient()
  const slug = await generateTrainingTypeSlug(supabase, user.id, name.trim())

  const { data, error } = await supabase
    .from('training_types')
    .insert([{
      trainer_id: user.id,
      slug,
      name: (name as string).trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      price_per_hour: typeof price_per_hour === 'number' ? price_per_hour : null,
      duration_min: typeof duration_min === 'number' ? duration_min : 60,
      is_active: typeof is_active === 'boolean' ? is_active : true,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Nie udało się utworzyć typu treningu' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
