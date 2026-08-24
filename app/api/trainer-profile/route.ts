import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { hasAnyRole } from '@/lib/roles'
import { toSlug } from '@/lib/utils'
import type { SupabaseClient } from '@supabase/supabase-js'

async function generateTrainerSlug(
  supabase: SupabaseClient,
  fullName: string,
  excludeTrainerId: string,
): Promise<string> {
  const base = toSlug(fullName) || 'trener'
  let slug = base
  let i = 2

  while (true) {
    const { data } = await supabase
      .from('trainer_profiles')
      .select('id')
      .eq('slug', slug)
      .neq('trainer_id', excludeTrainerId)
      .maybeSingle()

    if (!data) return slug
    slug = `${base}-${i++}`
  }
}

export async function GET() {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  if (!hasAnyRole(role, ['trainer', 'organizer'])) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('trainer_profiles')
    .select('*')
    .eq('trainer_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Nie udało się pobrać profilu trenera' }, { status: 500 })
  }

  // Return null if no profile exists (user can create one)
  return NextResponse.json(data || null)
}

export async function POST(req: Request) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  if (!hasAnyRole(role, ['trainer', 'organizer'])) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { full_name, bio, location_city, location_details, price_per_hour, profile_image_url, is_active } = body

  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return NextResponse.json({ error: 'Imię i nazwisko jest wymagane' }, { status: 400 })
  }

  const supabase = await createAuthClient()

  // Check if profile exists
  const { data: existing } = await supabase
    .from('trainer_profiles')
    .select('id')
    .eq('trainer_id', user.id)
    .single()

  const slug = await generateTrainerSlug(supabase, full_name.trim(), user.id)

  const profileData = {
    slug,
    full_name: full_name.trim(),
    bio: (bio as string | null) || null,
    location_city: (location_city as string | null) || null,
    location_details: (location_details as string | null) || null,
    price_per_hour: typeof price_per_hour === 'number' ? price_per_hour : null,
    profile_image_url: (profile_image_url as string | null) || null,
    is_active: typeof is_active === 'boolean' ? is_active : false,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('trainer_profiles')
      .update(profileData)
      .eq('trainer_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Nie udało się zaktualizować profilu trenera' }, { status: 500 })
    return NextResponse.json(data)
  } else {
    // Create new
    const { data, error } = await supabase
      .from('trainer_profiles')
      .insert([{ trainer_id: user.id, ...profileData }])
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Nie udało się utworzyć profilu trenera' }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }
}
