import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { toSlug } from '@/lib/utils'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'

async function generateTrainingTypeSlug(
  supabase: SupabaseClient,
  businessProfileId: string,
  name: string,
): Promise<string> {
  const base = toSlug(name) || 'trening'
  let slug = base
  let i = 2

  while (true) {
    const { data } = await supabase
      .from('training_types')
      .select('id')
      .eq('business_profile_id', businessProfileId)
      .eq('slug', slug)
      .maybeSingle()

    if (!data) return slug
    slug = `${base}-${i++}`
  }
}

export async function GET(req?: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  const result = await requireBusinessProfileAccessForApi(req ? new URL(req.url).searchParams.get('profileId') : null, 'trainings.offer')
  if ('error' in result) return result.error

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('training_types')
    .select('*')
    .eq('business_profile_id', result.access.profile.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Nie udało się pobrać typów treningów' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { name, description, price_per_hour, duration_min, is_active } = body
  const result = await requireBusinessProfileAccessForApi(typeof body.businessProfileId === 'string' ? body.businessProfileId : null, 'trainings.offer')
  if ('error' in result) return result.error

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

  const supabase = createServerClient()
  const slug = await generateTrainingTypeSlug(supabase, result.access.profile.id, name.trim())

  const { data, error } = await supabase
    .from('training_types')
    .insert([{
      trainer_id: result.access.profile.owner_id,
      business_profile_id: result.access.profile.id,
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
