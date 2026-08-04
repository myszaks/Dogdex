import { NextResponse } from 'next/server'
import { isEventTeamPermission, requireEventAccessForApi } from '@/lib/eventAccess'
import { createServerClient } from '@/lib/supabaseServer'

interface Params { params: Promise<{ id: string; memberId: string }> }

async function authorize(id: string, memberId: string) {
  const auth = await requireEventAccessForApi(id)
  if ('error' in auth) return auth
  if (!auth.access.canManageTeam) {
    return { error: NextResponse.json({ error: 'Tylko właściciel wydarzenia może zarządzać zespołem' }, { status: 403 }) }
  }
  const supabase = createServerClient()
  const { data: member } = await supabase
    .from('event_team_members')
    .select('id')
    .eq('id', memberId)
    .eq('event_id', auth.access.event.id)
    .maybeSingle()
  if (!member) return { error: NextResponse.json({ error: 'Nie znaleziono członka zespołu' }, { status: 404 }) }
  return { auth, supabase }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id, memberId } = await params
  const result = await authorize(id, memberId)
  if ('error' in result) return result.error
  let body: { permissions?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }
  const permissions = Array.isArray(body.permissions)
    ? [...new Set(body.permissions.filter(isEventTeamPermission))]
    : []
  if (permissions.length === 0) {
    return NextResponse.json({ error: 'Wybierz co najmniej jeden zakres dostępu' }, { status: 400 })
  }
  const { data, error } = await result.supabase
    .from('event_team_members')
    .update({ permissions })
    .eq('id', memberId)
    .select('id, email, user_id, permissions, status, created_at, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, memberId } = await params
  const result = await authorize(id, memberId)
  if ('error' in result) return result.error
  const { error } = await result.supabase.from('event_team_members').delete().eq('id', memberId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
