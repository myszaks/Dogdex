import { NextResponse } from 'next/server'
import { checkRoleForApi } from '@/lib/getServerUser'
import { createAuthClient } from '@/lib/supabaseServer'
import { validateCompetitionFormatDefinition } from '@/lib/competitionEngine'

export async function GET() {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()
  let query = supabase
    .from('competition_formats')
    .select('id, family_id, previous_version_id, version, name, description, status, definition, is_system, published_at, created_at, updated_at')
    .eq('status', 'published')
    .order('is_system', { ascending: false })
    .order('updated_at', { ascending: false })

  if (authResult.role !== 'admin') {
    query = query.or(
      `created_by.eq.${authResult.user.id},and(is_system.eq.true,status.eq.published)`,
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const validFormats = (data ?? []).filter(format =>
    validateCompetitionFormatDefinition(format.definition).success
  )
  return NextResponse.json(validFormats)
}

export async function POST(req: Request) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 120) {
    return NextResponse.json(
      { error: 'Nazwa formatu jest wymagana i może mieć maksymalnie 120 znaków.' },
      { status: 400 },
    )
  }

  const validation = validateCompetitionFormatDefinition(body.definition)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Definicja formatu jest nieprawidłowa.', issues: validation.issues },
      { status: 400 },
    )
  }

  const shouldPublish = body.status === 'published'
  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('competition_formats')
    .insert([{
      name,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      status: shouldPublish ? 'published' : 'draft',
      definition: validation.data,
      created_by: authResult.user.id,
      is_system: authResult.role === 'admin' && body.is_system === true,
      published_at: shouldPublish ? new Date().toISOString() : null,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
