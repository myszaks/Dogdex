import { NextResponse } from 'next/server'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'
import { BUSINESS_PERMISSION_LABELS, normalizeBusinessPermissions } from '@/lib/businessPermissions'
import { syncLegacyEventTeam } from '@/lib/businessTeam'
import { createServerClient } from '@/lib/supabaseServer'
import { sendOrganizerTeamInvitationEmail } from '@/lib/email'

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

async function namesForUserIds(db: ReturnType<typeof createServerClient>, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string | null>()
  const { data } = await db.from('profiles').select('id, full_name').in('id', userIds)
  return new Map((data ?? []).map(profile => [profile.id as string, profile.full_name as string | null]))
}

export async function GET(req: Request) {
  const profileId = new URL(req.url).searchParams.get('profileId')
  const result = await requireBusinessProfileAccessForApi(profileId, 'team.manage')
  if ('error' in result) return result.error
  const db = createServerClient()
  const { data, error } = await db.from('business_profile_members')
    .select('id, email, user_id, role_title, permissions, status, created_at, updated_at')
    .eq('business_profile_id', result.access.profile.id)
    .neq('user_id', result.access.profile.owner_id)
    .order('email')
  if (error) return NextResponse.json({ error: 'Nie udało się pobrać zespołu' }, { status: 500 })
  const userIds = [...new Set((data ?? []).map(member => member.user_id).filter(Boolean))] as string[]
  const names = await namesForUserIds(db, userIds)
  return NextResponse.json({
    profile: result.access.profile,
    members: (data ?? []).map(member => ({ ...member, fullName: member.user_id ? names.get(member.user_id) ?? null : null })),
  })
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 }) }
  const profileId = typeof body.profileId === 'string' ? body.profileId : null
  const result = await requireBusinessProfileAccessForApi(profileId, 'team.manage')
  if ('error' in result) return result.error
  const email = normalizeEmail(body.email)
  const permissions = normalizeBusinessPermissions(body.permissions)
  const roleTitle = typeof body.roleTitle === 'string' ? body.roleTitle.trim().slice(0, 80) || null : null
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Podaj prawidłowy adres e-mail' }, { status: 400 })
  if (email === result.access.user.email?.trim().toLowerCase()) return NextResponse.json({ error: 'Nie możesz zaprosić własnego konta' }, { status: 409 })
  if (permissions.length === 0) return NextResponse.json({ error: 'Wybierz co najmniej jedno uprawnienie' }, { status: 400 })
  if (!result.access.isOwner && !result.access.isAdmin && permissions.some(permission => !result.access.can(permission))) {
    return NextResponse.json({ error: 'Nie możesz delegować uprawnień, których sam nie posiadasz' }, { status: 403 })
  }

  const db = createServerClient()
  const { data: existing } = await db.from('business_profile_members')
    .select('id, user_id').eq('business_profile_id', result.access.profile.id).eq('email', email).maybeSingle()
  if (existing?.user_id === result.access.profile.owner_id) return NextResponse.json({ error: 'Nie można zmienić właściciela profilu' }, { status: 409 })
  let userId: string | null = existing?.user_id ?? null
  if (!userId) {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    userId = data.users.find(candidate => candidate.email?.trim().toLowerCase() === email)?.id ?? null
  }
  const payload = {
    business_profile_id: result.access.profile.id,
    email,
    user_id: userId,
    role_title: roleTitle,
    permissions,
    status: userId ? 'active' : 'pending',
    invited_by: result.access.user.id,
  }
  const query = existing
    ? db.from('business_profile_members').update(payload).eq('id', existing.id)
    : db.from('business_profile_members').insert(payload)
  const { data: member, error } = await query
    .select('id, email, user_id, role_title, permissions, status, created_at, updated_at').single()
  if (error || !member) return NextResponse.json({ error: 'Nie udało się zapisać osoby w zespole' }, { status: 500 })

  await syncLegacyEventTeam(db, {
    profileOwnerId: result.access.profile.owner_id,
    email, userId, permissions,
    status: userId ? 'active' : 'pending',
    actorId: result.access.user.id,
  })
  await db.from('business_profile_audit_log').insert({
    business_profile_id: result.access.profile.id,
    actor_id: result.access.user.id,
    action: existing ? 'team.member.updated' : 'team.member.invited',
    target_type: 'business_profile_member', target_id: member.id,
    metadata: { email, permissions },
  })
  await sendOrganizerTeamInvitationEmail({
    to: email,
    organizerName: result.access.profile.name,
    permissions: permissions.map(permission => BUSINESS_PERMISSION_LABELS[permission]),
  })
  const names = userId ? await namesForUserIds(db, [userId]) : new Map<string, string | null>()
  return NextResponse.json({ ...member, fullName: userId ? names.get(userId) ?? null : null }, { status: existing ? 200 : 201 })
}
