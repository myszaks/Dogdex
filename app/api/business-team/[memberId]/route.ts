import { NextResponse } from 'next/server'
import { requireBusinessProfileAccessForApi } from '@/lib/businessAccess'
import { normalizeBusinessPermissions } from '@/lib/businessPermissions'
import { syncLegacyEventTeam } from '@/lib/businessTeam'
import { createServerClient } from '@/lib/supabaseServer'

interface Params { params: Promise<{ memberId: string }> }

async function memberAccess(memberId: string) {
  const db = createServerClient()
  const { data: member } = await db.from('business_profile_members')
    .select('id, business_profile_id, email, user_id, permissions, status').eq('id', memberId).maybeSingle()
  if (!member) return { error: NextResponse.json({ error: 'Nie znaleziono osoby w zespole' }, { status: 404 }) } as const
  const result = await requireBusinessProfileAccessForApi(member.business_profile_id, 'team.manage')
  if ('error' in result) return result
  if (member.user_id === result.access.profile.owner_id) return { error: NextResponse.json({ error: 'Nie można zmienić właściciela profilu' }, { status: 409 }) } as const
  if (result.access.memberId === member.id) return { error: NextResponse.json({ error: 'Nie możesz zmieniać własnych uprawnień' }, { status: 409 }) } as const
  return { db, member, access: result.access } as const
}

export async function PATCH(req: Request, { params }: Params) {
  const { memberId } = await params
  const owned = await memberAccess(memberId)
  if ('error' in owned) return owned.error
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 }) }
  const update: Record<string, unknown> = {}
  if ('permissions' in body) {
    const permissions = normalizeBusinessPermissions(body.permissions)
    if (permissions.length === 0) return NextResponse.json({ error: 'Wybierz co najmniej jedno uprawnienie' }, { status: 400 })
    if (!owned.access.isOwner && !owned.access.isAdmin && permissions.some(permission => !owned.access.can(permission))) {
      return NextResponse.json({ error: 'Nie możesz delegować uprawnień, których sam nie posiadasz' }, { status: 403 })
    }
    update.permissions = permissions
  }
  if ('roleTitle' in body) update.role_title = typeof body.roleTitle === 'string' ? body.roleTitle.trim().slice(0, 80) || null : null
  if (body.status === 'active' || body.status === 'disabled') update.status = body.status
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Brak zmian' }, { status: 400 })
  const { data, error } = await owned.db.from('business_profile_members').update(update).eq('id', memberId)
    .select('id, email, user_id, role_title, permissions, status, created_at, updated_at').single()
  if (error || !data) return NextResponse.json({ error: 'Nie udało się zapisać zmian' }, { status: 500 })
  await syncLegacyEventTeam(owned.db, {
    profileOwnerId: owned.access.profile.owner_id,
    email: owned.member.email,
    userId: owned.member.user_id,
    permissions: Array.isArray(update.permissions) ? update.permissions : owned.member.permissions,
    status: (typeof update.status === 'string' ? update.status : owned.member.status) as 'pending' | 'active' | 'disabled',
    actorId: owned.access.user.id,
  })
  await owned.db.from('business_profile_audit_log').insert({
    business_profile_id: owned.member.business_profile_id, actor_id: owned.access.user.id,
    action: 'team.member.updated', target_type: 'business_profile_member', target_id: memberId,
    metadata: update,
  })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { memberId } = await params
  const owned = await memberAccess(memberId)
  if ('error' in owned) return owned.error
  await owned.db.from('business_profile_audit_log').insert({
    business_profile_id: owned.member.business_profile_id, actor_id: owned.access.user.id,
    action: 'team.member.removed', target_type: 'business_profile_member', target_id: memberId,
    metadata: { email: owned.member.email },
  })
  const { data: legacy } = await owned.db.from('organizer_team_members').select('id')
    .eq('organizer_id', owned.access.profile.owner_id).eq('email', owned.member.email).maybeSingle()
  if (legacy) {
    await owned.db.from('event_team_members').delete().eq('organizer_team_member_id', legacy.id)
    await owned.db.from('organizer_team_members').delete().eq('id', legacy.id)
  }
  const { error } = await owned.db.from('business_profile_members').delete().eq('id', memberId)
  if (error) return NextResponse.json({ error: 'Nie udało się usunąć osoby' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
