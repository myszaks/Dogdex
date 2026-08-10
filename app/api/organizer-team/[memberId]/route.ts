import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { isEventTeamPermission } from '@/lib/eventPermissions'
import { isOrganizerRole } from '@/lib/roles'
import { createServerClient } from '@/lib/supabaseServer'

interface Params { params: Promise<{ memberId: string }> }

async function ownedMember(memberId: string) {
  const { user, role } = await getServerUser()
  if (!user) return { error: NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 }) } as const
  if (!isOrganizerRole(role)) {
    return { error: NextResponse.json({ error: 'Brak uprawnień organizatora' }, { status: 403 }) } as const
  }
  const db = createServerClient()
  const { data: member } = await db
    .from('organizer_team_members')
    .select('id, organizer_id, email')
    .eq('id', memberId)
    .eq('organizer_id', user.id)
    .maybeSingle()
  if (!member) return { error: NextResponse.json({ error: 'Nie znaleziono osoby w zespole' }, { status: 404 }) } as const
  return { db, member, user } as const
}

export async function PATCH(request: Request, { params }: Params) {
  const { memberId } = await params
  const owned = await ownedMember(memberId)
  if ('error' in owned) return owned.error
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if ('defaultPermissions' in body) {
    const permissions = Array.isArray(body.defaultPermissions)
      ? [...new Set(body.defaultPermissions.filter(isEventTeamPermission))]
      : []
    if (permissions.length === 0) {
      return NextResponse.json({ error: 'Wybierz co najmniej jeden domyślny zakres pracy' }, { status: 400 })
    }
    update.default_permissions = permissions
  }
  if (typeof body.autoAssignNewEvents === 'boolean') {
    update.auto_assign_new_events = body.autoAssignNewEvents
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Brak zmian do zapisania' }, { status: 400 })
  }

  const { data, error } = await owned.db
    .from('organizer_team_members')
    .update(update)
    .eq('id', memberId)
    .select('id, email, user_id, default_permissions, auto_assign_new_events, status, created_at, updated_at')
    .single()
  if (error) return NextResponse.json({ error: 'Nie udało się zapisać zmian' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: Params) {
  const { memberId } = await params
  const owned = await ownedMember(memberId)
  if ('error' in owned) return owned.error

  const { error: assignmentError } = await owned.db
    .from('event_team_members')
    .delete()
    .eq('organizer_team_member_id', memberId)
  if (assignmentError) {
    return NextResponse.json({ error: 'Nie udało się odwołać dostępów do wydarzeń' }, { status: 500 })
  }

  const { error } = await owned.db.from('organizer_team_members').delete().eq('id', memberId)
  if (error) return NextResponse.json({ error: 'Nie udało się usunąć osoby z zespołu' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
