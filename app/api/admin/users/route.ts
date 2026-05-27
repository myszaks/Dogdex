import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'

// GET /api/admin/users — list all profiles (admin only)
export async function GET() {
  const auth = await checkRoleForApi(['admin'])
  if ('error' in auth) return auth.error

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, company, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/admin/users — update a user's role (admin only)
export async function PATCH(req: Request) {
  const auth = await checkRoleForApi(['admin'])
  if ('error' in auth) return auth.error

  let body: { id?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { id, role } = body
  if (!id || !role || typeof id !== 'string' || typeof role !== 'string') {
    return NextResponse.json({ error: 'Wymagane pola: id, role' }, { status: 400 })
  }

  // Prevent removing last admin
  if (role !== 'admin') {
    const supabaseCheck = createServerClient()
    const { count } = await supabaseCheck
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
    if ((count ?? 0) <= 1) {
      const { data: current } = await supabaseCheck
        .from('profiles')
        .select('role')
        .eq('id', id)
        .single()
      if (current?.role === 'admin') {
        return NextResponse.json(
          { error: 'Nie można usunąć ostatniego administratora.' },
          { status: 409 }
        )
      }
    }
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', id)
    .select('id, role, full_name')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
