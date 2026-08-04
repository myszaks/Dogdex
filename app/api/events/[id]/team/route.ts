import { NextResponse } from 'next/server'
import { EVENT_TEAM_PERMISSION_LABELS, isEventTeamPermission, requireEventAccessForApi } from '@/lib/eventAccess'
import { sendEventTeamInvitationEmail } from '@/lib/email'
import { createServerClient } from '@/lib/supabaseServer'

interface Params { params: Promise<{ id: string }> }

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const auth = await requireEventAccessForApi(id)
  if ('error' in auth) return auth.error
  if (!auth.access.canManageTeam) {
    return NextResponse.json({ error: 'Tylko właściciel wydarzenia może zarządzać zespołem' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('event_team_members')
    .select('id, email, user_id, permissions, status, created_at, updated_at')
    .eq('event_id', auth.access.event.id)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((data ?? []).map(member => member.user_id).filter(Boolean))] as string[]
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> }
  const names = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name]))

  return NextResponse.json({
    canManageTeam: auth.access.canManageTeam,
    owner: { userId: auth.access.event.created_by },
    members: (data ?? []).map(member => ({ ...member, fullName: member.user_id ? names.get(member.user_id) ?? null : null })),
  })
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const auth = await requireEventAccessForApi(id)
  if ('error' in auth) return auth.error
  if (!auth.access.canManageTeam) {
    return NextResponse.json({ error: 'Tylko właściciel wydarzenia może zarządzać zespołem' }, { status: 403 })
  }

  let body: { email?: unknown; permissions?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }
  const email = normalizeEmail(body.email)
  const permissions = Array.isArray(body.permissions)
    ? [...new Set(body.permissions.filter(isEventTeamPermission))]
    : []
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'Podaj prawidłowy adres e-mail' }, { status: 400 })
  }
  if (permissions.length === 0) {
    return NextResponse.json({ error: 'Wybierz co najmniej jeden zakres dostępu' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { data: ownerAuth } = await supabase.auth.admin.getUserById(auth.access.event.created_by)
  if (email === ownerAuth.user?.email?.trim().toLowerCase()) {
    return NextResponse.json({ error: 'Właściciel wydarzenia ma już pełny dostęp' }, { status: 409 })
  }
  const { data: existing } = await supabase
    .from('event_team_members')
    .select('id, user_id')
    .eq('event_id', auth.access.event.id)
    .eq('email', email)
    .maybeSingle()

  let matchingUserId: string | null = existing?.user_id ?? null
  if (!matchingUserId) {
    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    matchingUserId = users.users.find(user => user.email?.trim().toLowerCase() === email)?.id ?? null
  }

  const payload = {
    event_id: auth.access.event.id,
    email,
    user_id: matchingUserId,
    permissions,
    status: matchingUserId ? 'active' : 'pending',
    invited_by: auth.access.user.id,
  }
  const query = existing
    ? supabase.from('event_team_members').update(payload).eq('id', existing.id)
    : supabase.from('event_team_members').insert(payload)
  const { data: member, error } = await query
    .select('id, email, user_id, permissions, status, created_at, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await sendEventTeamInvitationEmail({
    to: email,
    eventTitle: auth.access.event.title,
    eventSlug: auth.access.event.slug,
    permissions: permissions.map(permission => EVENT_TEAM_PERMISSION_LABELS[permission]),
  })

  return NextResponse.json(member, { status: existing ? 200 : 201 })
}
