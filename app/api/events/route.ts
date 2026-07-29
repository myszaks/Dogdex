import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { toSlug } from '@/lib/utils'
import {
  validateCompetitionFieldValues,
  validateCompetitionFormatDefinition,
} from '@/lib/competitionEngine'
import { validateFormFieldDefinitions } from '@/lib/registrationFormValidation'
import { validateEventCompetitionDependencies } from '@/lib/eventCompetitionDependencies'

export async function GET() {
  // Public read — auth client works for both authed and anon users
  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .neq('status', 'draft')
    .order('start_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { title, description, location, start_at, end_at, status, event_type_id, form_fields, form_template_id, registration_deadline, has_results, results_public, has_schedule, auto_confirm, max_participants, entry_fee, image_url, organizer_name, lat, lng, gallery_images, grouping_field, competition_format_id, competition_config, competition_values } = body as Record<string, unknown>

  const nextStatus = typeof status === 'string' ? status : 'upcoming'
  const normalizedTitle = typeof title === 'string' && title.trim() !== ''
    ? title.trim()
    : nextStatus === 'draft'
      ? 'Szkic wydarzenia'
      : ''

  if (!normalizedTitle) {
    return NextResponse.json({ error: 'Tytuł jest wymagany' }, { status: 400 })
  }
  if (nextStatus !== 'draft') {
    const fieldIssues = validateFormFieldDefinitions(Array.isArray(form_fields) ? form_fields : [])
    if (fieldIssues.length > 0) {
      return NextResponse.json(
        { error: fieldIssues[0].message, issues: fieldIssues },
        { status: 400 },
      )
    }
  }

  // Generate a unique slug
  const baseSlug = toSlug(normalizedTitle) || 'event'
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

  let competitionFormatId: string | null = null
  let competitionConfig: unknown = null

  if (typeof competition_format_id === 'string' && competition_format_id) {
    const { data: format, error: formatError } = await supabase
      .from('competition_formats')
      .select('id, status, definition, created_by')
      .eq('id', competition_format_id)
      .maybeSingle()

    if (formatError) return NextResponse.json({ error: formatError.message }, { status: 500 })
    if (!format) return NextResponse.json({ error: 'Nie znaleziono wybranego formatu zawodów.' }, { status: 404 })
    if (nextStatus !== 'draft' && format.status !== 'published') {
      return NextResponse.json(
        { error: 'Przed publikacją wydarzenia opublikuj jego format zawodów.' },
        { status: 409 },
      )
    }
    if (
      format.status === 'draft'
      && authResult.role !== 'admin'
      && format.created_by !== authResult.user.id
    ) {
      return NextResponse.json({ error: 'Brak dostępu do roboczego formatu zawodów.' }, { status: 403 })
    }
    competitionFormatId = format.id
    competitionConfig = format.definition
  }

  if (
    competitionFormatId === null
    && competition_config !== undefined
    && competition_config !== null
  ) {
    competitionConfig = competition_config
  }

  if (competitionConfig !== null) {
    const validation = validateCompetitionFormatDefinition(competitionConfig)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Konfiguracja zawodów jest nieprawidłowa.', issues: validation.issues },
        { status: 400 },
      )
    }
    competitionConfig = validation.data
  }

  const competitionValues = (
    typeof competition_values === 'object'
    && competition_values !== null
    && !Array.isArray(competition_values)
  ) ? competition_values : {}
  if (competitionConfig !== null) {
    const valueIssues = validateCompetitionFieldValues(
      (competitionConfig as import('@/types/competition').CompetitionFormatDefinition).eventFields,
      competitionValues,
      { requireRequired: nextStatus !== 'draft' },
    )
    if (valueIssues.length > 0) {
      return NextResponse.json(
        { error: 'Parametry formatu zawodów są nieprawidłowe.', issues: valueIssues },
        { status: 400 },
      )
    }
    if (nextStatus !== 'draft') {
      const dependencyIssues = validateEventCompetitionDependencies(
        Array.isArray(form_fields) ? form_fields : [],
        competitionConfig as import('@/types/competition').CompetitionFormatDefinition,
      )
      if (dependencyIssues.length > 0) {
        return NextResponse.json(
          { error: dependencyIssues[0].message, issues: dependencyIssues },
          { status: 400 },
        )
      }
    }
  }

  const { data, error } = await supabase
    .from('events')
    .insert([{
      title: normalizedTitle,
      slug,
      description: (description as string | null) ?? null,
      location: (location as string | null) ?? null,
      start_at: (start_at as string | null) ?? null,
      end_at: (end_at as string | null) ?? null,
      registration_deadline: (registration_deadline as string | null) ?? null,
      status: nextStatus,
      event_type_id: (event_type_id as string | null) ?? null,
      form_fields: Array.isArray(form_fields) ? form_fields : [],
      has_results: typeof has_results === 'boolean' ? has_results : false,
      results_public: typeof results_public === 'boolean' ? results_public : true,
      has_schedule: typeof has_schedule === 'boolean' ? has_schedule : false,
      auto_confirm: typeof auto_confirm === 'boolean' ? auto_confirm : false,
      max_participants: typeof max_participants === 'number' ? max_participants : null,
      entry_fee: typeof entry_fee === 'number' ? entry_fee : null,
      image_url: (image_url as string | null) ?? null,
      organizer_name: (organizer_name as string | null) ?? null,
      created_by: authResult.user.id,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      gallery_images: Array.isArray(gallery_images) ? gallery_images : [],
      grouping_field: (grouping_field as string | null) ?? null,
      form_template_id: (form_template_id as string | null) ?? null,
      competition_format_id: competitionFormatId,
      competition_config: competitionConfig,
      competition_values: competitionValues,
      competition_config_revision: 1,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
