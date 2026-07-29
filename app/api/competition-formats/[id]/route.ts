import { NextResponse } from 'next/server'
import { checkRoleForApi } from '@/lib/getServerUser'
import { createAuthClient } from '@/lib/supabaseServer'
import { validateCompetitionFormatDefinition } from '@/lib/competitionEngine'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error
  const { id } = await params

  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('competition_formats')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Nie znaleziono formatu.' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: Params) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error
  const { id } = await params

  const supabase = await createAuthClient()
  const { data: existing, error: readError } = await supabase
    .from('competition_formats')
    .select('id, created_by, status, is_system')
    .eq('id', id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Nie znaleziono formatu.' }, { status: 404 })
  if (
    authResult.role !== 'admin'
    && (existing.created_by !== authResult.user.id || existing.is_system)
  ) {
    return NextResponse.json({ error: 'Brak uprawnień do edycji tego formatu.' }, { status: 403 })
  }
  if (existing.status !== 'draft') {
    return NextResponse.json(
      { error: 'Opublikowany format jest niezmienny. Utwórz jego nową wersję.' },
      { status: 409 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 120) {
      return NextResponse.json({ error: 'Nieprawidłowa nazwa formatu.' }, { status: 400 })
    }
    update.name = name
  }
  if ('description' in body) {
    update.description = typeof body.description === 'string'
      ? body.description.trim() || null
      : null
  }
  if ('definition' in body) {
    const validation = validateCompetitionFormatDefinition(body.definition)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Definicja formatu jest nieprawidłowa.', issues: validation.issues },
        { status: 400 },
      )
    }
    update.definition = validation.data
  }
  if (body.status === 'published') {
    const definition = 'definition' in update
      ? update.definition
      : await supabase
          .from('competition_formats')
          .select('definition')
          .eq('id', id)
          .single()
          .then(result => result.data?.definition)
    const validation = validateCompetitionFormatDefinition(definition)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Nie można opublikować nieprawidłowego formatu.', issues: validation.issues },
        { status: 400 },
      )
    }
    update.status = 'published'
    update.published_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('competition_formats')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
