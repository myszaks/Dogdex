import { NextResponse } from 'next/server'
import { checkRoleForApi } from '@/lib/getServerUser'
import { createAuthClient } from '@/lib/supabaseServer'
import { validateCompetitionFormatDefinition } from '@/lib/competitionEngine'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error
  const { id } = await params
  const supabase = await createAuthClient()

  const { data: source, error: readError } = await supabase
    .from('competition_formats')
    .select('id, family_id, version, name, description, definition, status, created_by, is_system')
    .eq('id', id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!source) return NextResponse.json({ error: 'Nie znaleziono formatu.' }, { status: 404 })
  if (source.status !== 'published') {
    return NextResponse.json(
      { error: 'Nową wersję można utworzyć tylko z opublikowanego formatu.' },
      { status: 409 },
    )
  }
  if (
    authResult.role !== 'admin'
    && source.created_by !== authResult.user.id
    && !source.is_system
  ) {
    return NextResponse.json({ error: 'Brak uprawnień do wersjonowania tego formatu.' }, { status: 403 })
  }
  const validation = validateCompetitionFormatDefinition(source.definition)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Format źródłowy ma nieprawidłową definicję.', issues: validation.issues },
      { status: 409 },
    )
  }

  const forksSystemFormat = source.is_system && authResult.role !== 'admin'
  if (!forksSystemFormat) {
    const { data: existingDraft, error: draftError } = await supabase
      .from('competition_formats')
      .select('*')
      .eq('family_id', source.family_id)
      .eq('status', 'draft')
      .maybeSingle()

    if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 })
    if (existingDraft) {
      return NextResponse.json({ ...existingDraft, reused: true })
    }
  } else {
    const { data: existingFork, error: forkError } = await supabase
      .from('competition_formats')
      .select('*')
      .eq('previous_version_id', source.id)
      .eq('created_by', authResult.user.id)
      .eq('status', 'draft')
      .maybeSingle()

    if (forkError) return NextResponse.json({ error: forkError.message }, { status: 500 })
    if (existingFork) {
      return NextResponse.json({ ...existingFork, reused: true })
    }
  }

  let nextVersion = source.version + 1
  if (!forksSystemFormat) {
    const { data: newest, error: newestError } = await supabase
      .from('competition_formats')
      .select('version')
      .eq('family_id', source.family_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (newestError) return NextResponse.json({ error: newestError.message }, { status: 500 })
    nextVersion = (newest?.version ?? source.version) + 1
  }

  const insertPayload: Record<string, unknown> = {
    previous_version_id: source.id,
    version: nextVersion,
    name: source.name,
    description: source.description,
    definition: validation.data,
    status: 'draft',
    created_by: forksSystemFormat ? authResult.user.id : source.created_by,
    is_system: source.is_system && authResult.role === 'admin',
  }
  if (!forksSystemFormat) insertPayload.family_id = source.family_id

  const { data, error } = await supabase
    .from('competition_formats')
    .insert([insertPayload])
    .select()
    .single()

  if (error?.code === '23505') {
    return NextResponse.json(
      { error: 'Dla tego formatu istnieje już wersja robocza lub nowsza wersja.' },
      { status: 409 },
    )
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
