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
    .select('id, family_id, version, name, description, definition, created_by, is_system')
    .eq('id', id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!source) return NextResponse.json({ error: 'Nie znaleziono formatu.' }, { status: 404 })
  if (authResult.role !== 'admin' && source.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Brak uprawnień do wersjonowania tego formatu.' }, { status: 403 })
  }
  const validation = validateCompetitionFormatDefinition(source.definition)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Format źródłowy ma nieprawidłową definicję.', issues: validation.issues },
      { status: 409 },
    )
  }

  const { data, error } = await supabase
    .from('competition_formats')
    .insert([{
      family_id: source.family_id,
      previous_version_id: source.id,
      version: source.version + 1,
      name: source.name,
      description: source.description,
      definition: validation.data,
      status: 'draft',
      created_by: source.is_system ? authResult.user.id : source.created_by,
      is_system: source.is_system && authResult.role === 'admin',
    }])
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
