import { NextResponse } from 'next/server'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { toSlug } from '@/lib/utils'

export async function GET() {
  // Public read — service role bypasses RLS, always works
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('start_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = createServerClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { title, description, location, start_at, end_at, status, event_type_id, form_fields, registration_deadline, has_results, results_public, auto_confirm, max_participants, image_url, organizer_name, lat, lng, gallery_images, grouping_field } = body as Record<string, unknown>

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: 'Tytuł jest wymagany' }, { status: 400 })
  }

  // Generate a unique slug
  const baseSlug = toSlug((title as string).trim()) || 'event'
  let slug = baseSlug
  let counter = 1
  while (true) {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!existing) break
    counter += 1
    slug = `${baseSlug}-${counter}`
  }

  const { data, error } = await supabase
    .from('events')
    .insert([{
      title: (title as string).trim(),
      slug,
      description: (description as string | null) ?? null,
      location: (location as string | null) ?? null,
      start_at: (start_at as string | null) ?? null,
      end_at: (end_at as string | null) ?? null,
      registration_deadline: (registration_deadline as string | null) ?? null,
      status: (status as string) ?? 'upcoming',
      event_type_id: (event_type_id as string | null) ?? null,
      form_fields: Array.isArray(form_fields) ? form_fields : [],
      has_results: typeof has_results === 'boolean' ? has_results : false,
      results_public: typeof results_public === 'boolean' ? results_public : true,
      auto_confirm: typeof auto_confirm === 'boolean' ? auto_confirm : false,
      max_participants: typeof max_participants === 'number' ? max_participants : null,
      image_url: (image_url as string | null) ?? null,
      organizer_name: (organizer_name as string | null) ?? null,
      created_by: authResult.user.id,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      gallery_images: Array.isArray(gallery_images) ? gallery_images : [],
      grouping_field: (grouping_field as string | null) ?? null,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
