import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { validateFormFieldDefinitions } from '@/lib/registrationFormValidation'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const { user: authUser } = await getServerUser()
  if (!authUser) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const fields = body.fields
  if (!name) {
    return NextResponse.json({ error: 'Nazwa szablonu jest wymagana' }, { status: 400 })
  }
  const fieldIssues = validateFormFieldDefinitions(fields, { allowEmptyOptions: true })
  if (fieldIssues.length > 0) {
    return NextResponse.json(
      { error: fieldIssues[0].message, issues: fieldIssues },
      { status: 400 },
    )
  }

  const supabase = await createAuthClient()
  const { data: template } = await supabase
    .from('form_templates')
    .select('id, created_by')
    .eq('id', id)
    .single()

  if (!template) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  if (template.created_by !== authUser.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('form_templates')
    .update({
      name,
      event_type_id: typeof body.event_type_id === 'string' ? body.event_type_id : null,
      fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const { user: authUser } = await getServerUser()
  if (!authUser) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const supabase = await createAuthClient()

  // Verify ownership before delete
  const { data: template } = await supabase
    .from('form_templates')
    .select('id, created_by')
    .eq('id', id)
    .single()

  if (!template) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  if (template.created_by !== authUser.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const { error } = await supabase.from('form_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
