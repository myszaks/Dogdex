import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser, checkRoleForApi } from '@/lib/getServerUser'
import { validateFormFieldDefinitions } from '@/lib/registrationFormValidation'

export async function GET(req: Request) {
  const { user: authUser } = await getServerUser()
  if (!authUser) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const eventTypeId = searchParams.get('event_type_id')

  const supabase = await createAuthClient()
  let query = supabase
    .from('form_templates')
    .select('id, name, event_type_id, fields, created_at')
    .eq('created_by', authUser.id)
    .order('created_at', { ascending: false })

  if (eventTypeId) query = query.eq('event_type_id', eventTypeId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const { user: authUser } = await getServerUser()
  if (!authUser) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { name, event_type_id, fields } = body as {
    name: string
    event_type_id?: string | null
    fields: unknown[]
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nazwa szablonu jest wymagana' }, { status: 400 })
  }
  if (!Array.isArray(fields)) {
    return NextResponse.json({ error: 'fields musi być tablicą' }, { status: 400 })
  }
  const fieldIssues = validateFormFieldDefinitions(fields, { allowEmptyOptions: true })
  if (fieldIssues.length > 0) {
    return NextResponse.json(
      { error: fieldIssues[0].message, issues: fieldIssues },
      { status: 400 },
    )
  }

  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('form_templates')
    .insert([{
      name: name.trim(),
      event_type_id: event_type_id ?? null,
      created_by: authUser.id,
      fields,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
