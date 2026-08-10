import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { isOrganizerRole } from '@/lib/roles'
import { createServerClient } from '@/lib/supabaseServer'
import {
  EVENT_TEAM_PERMISSION_LABELS,
  isEventTeamPermission,
} from '@/lib/eventPermissions'
import { sendOrganizerTeamInvitationEmail } from '@/lib/email'

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function permissionsFrom(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter(isEventTeamPermission))]
    : []
}

async function organizerSession() {
  const { user, role } = await getServerUser()
  if (!user) return { error: NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 }) } as const
  if (!isOrganizerRole(role)) {
    return { error: NextResponse.json({ error: 'Brak uprawnień organizatora' }, { status: 403 }) } as const
  }
  return { user } as const
}

async function namesForUserIds(db: ReturnType<typeof createServerClient>, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string | null>()
  const { data } = await db.from('profiles').select('id, full_name').in('id', userIds)
  return new Map((data ?? []).map(profile => [profile.id as string, profile.full_name as string | null]))
}

export async function GET() {
  const session = await organizerSession()
  if ('error' in session) return session.error
  const db = createServerClient()
  const { data, error } = await db
    .from('organizer_team_members')
    .select('id, email, user_id, default_permissions, auto_assign_new_events, status, created_at, updated_at')
    .eq('organizer_id', session.user.id)
    .order('email')
  if (error) return NextResponse.json({ error: 'Nie udało się pobrać zespołu organizatora' }, { status: 500 })

  const userIds = [...new Set((data ?? []).map(member => member.user_id).filter(Boolean))] as string[]
  const names = await namesForUserIds(db, userIds)
  return NextResponse.json((data ?? []).map(member => ({
    ...member,
    fullName: member.user_id ? names.get(member.user_id) ?? null : null,
  })))
}

export async function POST(request: Request) {
  const session = await organizerSession()
  if ('error' in session) return session.error

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }

  const email = normalizeEmail(body.email)
  const defaultPermissions = permissionsFrom(body.defaultPermissions)
  const autoAssignNewEvents = body.autoAssignNewEvents !== false
  const assignExistingEvents = body.assignExistingEvents === true
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'Podaj prawidłowy adres e-mail' }, { status: 400 })
  }
  if (email === session.user.email?.trim().toLowerCase()) {
    return NextResponse.json({ error: 'Właściciel profilu ma już pełny dostęp' }, { status: 409 })
  }
  if (defaultPermissions.length === 0) {
    return NextResponse.json({ error: 'Wybierz co najmniej jeden domyślny zakres pracy' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: existing } = await db
    .from('organizer_team_members')
    .select('id, user_id')
    .eq('organizer_id', session.user.id)
    .eq('email', email)
    .maybeSingle()

  let userId: string | null = existing?.user_id ?? null
  if (!userId) {
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    userId = users.users.find(user => user.email?.trim().toLowerCase() === email)?.id ?? null
  }

  const payload = {
    organizer_id: session.user.id,
    email,
    user_id: userId,
    default_permissions: defaultPermissions,
    auto_assign_new_events: autoAssignNewEvents,
    status: userId ? 'active' : 'pending',
    invited_by: session.user.id,
  }
  const memberQuery = existing
    ? db.from('organizer_team_members').update(payload).eq('id', existing.id)
    : db.from('organizer_team_members').insert(payload)
  const { data: member, error } = await memberQuery
    .select('id, email, user_id, default_permissions, auto_assign_new_events, status, created_at, updated_at')
    .single()
  if (error || !member) {
    return NextResponse.json({ error: 'Nie udało się zapisać osoby w zespole' }, { status: 500 })
  }

  if (assignExistingEvents) {
    const { data: events } = await db.from('events').select('id').eq('created_by', session.user.id)
    const assignments = (events ?? []).map(event => ({
      event_id: event.id,
      email,
      user_id: userId,
      permissions: defaultPermissions,
      status: userId ? 'active' : 'pending',
      invited_by: session.user.id,
      organizer_team_member_id: member.id,
    }))
    if (assignments.length > 0) {
      const { error: assignmentError } = await db
        .from('event_team_members')
        .upsert(assignments, { onConflict: 'event_id,email', ignoreDuplicates: true })
      if (assignmentError) {
        return NextResponse.json({ error: 'Osoba została dodana, ale nie udało się przypisać jej do istniejących wydarzeń' }, { status: 500 })
      }
      await db
        .from('event_team_members')
        .update({ organizer_team_member_id: member.id })
        .in('event_id', (events ?? []).map(event => event.id))
        .eq('email', email)
        .is('organizer_team_member_id', null)
    }
  }

  const [{ data: organizerProfile }, { data: accountProfile }] = await Promise.all([
    db.from('organizer_profiles').select('display_name, organization_name').eq('organizer_id', session.user.id).maybeSingle(),
    db.from('profiles').select('full_name, company').eq('id', session.user.id).maybeSingle(),
  ])
  const organizerName = organizerProfile?.organization_name
    || organizerProfile?.display_name
    || accountProfile?.company
    || accountProfile?.full_name
    || session.user.email
    || 'Organizator Dogdex'
  await sendOrganizerTeamInvitationEmail({
    to: email,
    organizerName,
    permissions: defaultPermissions.map(permission => EVENT_TEAM_PERMISSION_LABELS[permission]),
  })

  const names = userId ? await namesForUserIds(db, [userId]) : new Map<string, string | null>()
  return NextResponse.json({
    ...member,
    fullName: userId ? names.get(userId) ?? null : null,
  }, { status: existing ? 200 : 201 })
}
