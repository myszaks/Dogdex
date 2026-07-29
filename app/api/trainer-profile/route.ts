import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { toSlug } from '@/lib/utils'
import { isTrainerRole } from '@/lib/roles'
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

async function getStripeStatus(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('stripe_onboarded')
    .eq('id', userId)
    .maybeSingle()

  return Boolean(data?.stripe_onboarded)
}

export async function GET() {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  if (!isTrainerRole(role)) {
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

  const stripeOnboarded = await getStripeStatus(supabase, user.id)

  // Return null if no profile exists (user can create one)
  return NextResponse.json(data ? { ...data, stripe_onboarded: stripeOnboarded } : null)
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

  const { full_name, bio, location_city, location_details, price_per_hour, profile_image_url, is_active } = body

  if (
    !full_name
    || typeof full_name !== 'string'
    || !full_name.trim()
    || full_name.trim().length > 120
  ) {
    return NextResponse.json({ error: 'Imię i nazwisko musi mieć od 1 do 120 znaków' }, { status: 400 })
  }
  if (bio != null && (typeof bio !== 'string' || bio.length > 5000)) {
    return NextResponse.json({ error: 'Opis może mieć maksymalnie 5000 znaków' }, { status: 400 })
  }
  if (location_city != null && (typeof location_city !== 'string' || location_city.length > 120)) {
    return NextResponse.json({ error: 'Miasto może mieć maksymalnie 120 znaków' }, { status: 400 })
  }
  if (
    location_details != null
    && (typeof location_details !== 'string' || location_details.length > 500)
  ) {
    return NextResponse.json({ error: 'Lokalizacja może mieć maksymalnie 500 znaków' }, { status: 400 })
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
    return NextResponse.json({ error: 'Nieprawidłowa cena godzinowa' }, { status: 400 })
  }
  if (profile_image_url != null && typeof profile_image_url !== 'string') {
    return NextResponse.json({ error: 'Nieprawidłowy adres zdjęcia' }, { status: 400 })
  }
  if (typeof profile_image_url === 'string' && profile_image_url) {
    try {
      const imageUrl = new URL(profile_image_url)
      if (imageUrl.protocol !== 'https:' || profile_image_url.length > 2048) {
        throw new Error('invalid')
      }
    } catch {
      return NextResponse.json({ error: 'Nieprawidłowy adres zdjęcia' }, { status: 400 })
    }
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
    bio: typeof bio === 'string' ? bio.trim() || null : null,
    location_city: typeof location_city === 'string' ? location_city.trim() || null : null,
    location_details: typeof location_details === 'string' ? location_details.trim() || null : null,
    price_per_hour: typeof price_per_hour === 'number' ? price_per_hour : null,
    profile_image_url: typeof profile_image_url === 'string' ? profile_image_url || null : null,
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
    const stripeOnboarded = await getStripeStatus(supabase, user.id)
    return NextResponse.json({ ...data, stripe_onboarded: stripeOnboarded })
  } else {
    // Create new
    const { data, error } = await supabase
      .from('trainer_profiles')
      .insert([{ trainer_id: user.id, ...profileData }])
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Nie udało się utworzyć profilu trenera' }, { status: 500 })
    const stripeOnboarded = await getStripeStatus(supabase, user.id)
    return NextResponse.json({ ...data, stripe_onboarded: stripeOnboarded }, { status: 201 })
  }
}
