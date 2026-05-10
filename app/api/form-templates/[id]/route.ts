import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'

interface Params {
  params: Promise<{ id: string }>
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
