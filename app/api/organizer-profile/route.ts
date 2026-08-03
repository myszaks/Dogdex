import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { isOrganizerRole } from '@/lib/roles'
import { toSlug } from '@/lib/utils'

async function availableSlug(supabase: SupabaseClient, label: string, organizerId: string) {
  const base = toSlug(label) || 'organizator'
  let slug = base
  let suffix = 2
  while (true) {
    const { data } = await supabase
      .from('organizer_profiles')
      .select('organizer_id')
      .eq('slug', slug)
      .maybeSingle()
    if (!data || data.organizer_id === organizerId) return slug
    slug = `${base}-${suffix++}`
  }
}

function optionalText(value: unknown, maxLength: number) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > maxLength) return undefined
  return value.trim()
}

export async function GET() {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!isOrganizerRole(role)) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })

  const supabase = await createAuthClient()
  const [{ data: organizerProfile, error }, { data: accountProfile }] = await Promise.all([
    supabase.from('organizer_profiles').select('*').eq('organizer_id', user.id).maybeSingle(),
    supabase.from('profiles').select('full_name, company').eq('id', user.id).maybeSingle(),
  ])
  if (error) return NextResponse.json({ error: 'Nie udało się pobrać profilu organizatora' }, { status: 500 })
  return NextResponse.json({
    profile: organizerProfile ?? null,
    defaults: {
      display_name: accountProfile?.full_name ?? '',
      organization_name: accountProfile?.company ?? '',
    },
  })
}

export async function POST(req: Request) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!isOrganizerRole(role)) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const displayName = optionalText(body.display_name, 120)
  const organizationName = optionalText(body.organization_name, 160)
  const bio = optionalText(body.bio, 5000)
  const locationCity = optionalText(body.location_city, 120)
  const profileImageUrl = optionalText(body.profile_image_url, 2048)
  const websiteUrl = optionalText(body.website_url, 2048)

  if (!displayName) return NextResponse.json({ error: 'Nazwa publiczna jest wymagana' }, { status: 400 })
  if ([organizationName, bio, locationCity, profileImageUrl, websiteUrl].includes(undefined)) {
    return NextResponse.json({ error: 'Jedno z pól jest zbyt długie lub nieprawidłowe' }, { status: 400 })
  }
  for (const [label, value] of [['adres zdjęcia', profileImageUrl], ['adres strony', websiteUrl]] as const) {
    if (!value) continue
    try {
      const parsed = new URL(value)
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('protocol')
    } catch {
      return NextResponse.json({ error: `Nieprawidłowy ${label}` }, { status: 400 })
    }
  }

  const supabase = await createAuthClient()
  const { data: existing } = await supabase
    .from('organizer_profiles')
    .select('id, slug')
    .eq('organizer_id', user.id)
    .maybeSingle()
  const slug = existing?.slug ?? await availableSlug(
    supabase,
    organizationName || displayName,
    user.id,
  )
  const profileData = {
    organizer_id: user.id,
    slug,
    display_name: displayName,
    organization_name: organizationName,
    bio,
    location_city: locationCity,
    profile_image_url: profileImageUrl,
    website_url: websiteUrl,
    is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
  }

  const query = existing
    ? supabase.from('organizer_profiles').update(profileData).eq('organizer_id', user.id)
    : supabase.from('organizer_profiles').insert(profileData)
  const { data, error } = await query.select().single()
  if (error) return NextResponse.json({ error: 'Nie udało się zapisać profilu organizatora' }, { status: 500 })
  return NextResponse.json(data, { status: existing ? 200 : 201 })
}
