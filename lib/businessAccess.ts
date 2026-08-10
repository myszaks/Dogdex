import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient } from '@/lib/supabaseServer'
import { cookies } from 'next/headers'
import {
  BUSINESS_PERMISSIONS,
  isBusinessPermission,
  type BusinessPermission,
} from '@/lib/businessPermissions'

export interface BusinessProfileAccess {
  profile: {
    id: string
    owner_id: string
    name: string
    slug: string
    profile_type: 'individual' | 'organization'
  }
  user: NonNullable<Awaited<ReturnType<typeof getServerUser>>['user']>
  role: string
  isOwner: boolean
  isAdmin: boolean
  memberId: string | null
  permissions: BusinessPermission[]
  can: (permission: BusinessPermission) => boolean
}

export async function getBusinessProfileAccess(profileId?: string | null, ignoreActiveCookie = false): Promise<BusinessProfileAccess | null> {
  const { user, role } = await getServerUser()
  if (!user) return null
  const db = createServerClient()
  let fromActiveCookie = false
  if (!profileId && !ignoreActiveCookie) {
    try {
      profileId = (await cookies()).get('dogdex_active_business_profile')?.value ?? null
      fromActiveCookie = Boolean(profileId)
    } catch {
      profileId = null
    }
  }

  let profile: BusinessProfileAccess['profile'] | null = null
  if (profileId) {
    const { data } = await db.from('business_profiles')
      .select('id, owner_id, name, slug, profile_type')
      .eq('id', profileId).eq('status', 'active').maybeSingle()
    profile = data as BusinessProfileAccess['profile'] | null
  } else {
    const { data: owned } = await db.from('business_profiles')
      .select('id, owner_id, name, slug, profile_type')
      .eq('owner_id', user.id).eq('status', 'active')
      .order('is_default', { ascending: false }).order('created_at').limit(1).maybeSingle()
    profile = owned as BusinessProfileAccess['profile'] | null

    if (!profile) {
      const email = user.email?.trim().toLowerCase() ?? ''
      const { data: byUser } = await db.from('business_profile_members')
        .select('business_profiles!inner(id, owner_id, name, slug, profile_type, status)')
        .eq('user_id', user.id).in('status', ['pending', 'active']).limit(1)
      const { data: byEmail } = !byUser?.length && email
        ? await db.from('business_profile_members')
          .select('business_profiles!inner(id, owner_id, name, slug, profile_type, status)')
          .eq('email', email).in('status', ['pending', 'active']).limit(1)
        : { data: null }
      const memberships = byUser?.length ? byUser : byEmail
      const relation = memberships?.[0]?.business_profiles
      const candidate = Array.isArray(relation) ? relation[0] : relation
      if (candidate?.status === 'active') profile = candidate as BusinessProfileAccess['profile']
    }
  }
  if (!profile) return fromActiveCookie ? getBusinessProfileAccess(null, true) : null

  const isAdmin = role === 'admin'
  const isOwner = profile.owner_id === user.id
  let memberId: string | null = null
  let permissions: BusinessPermission[] = []
  if (!isOwner && !isAdmin) {
    const normalizedEmail = user.email?.trim().toLowerCase() ?? ''
    const { data: memberships } = await db.from('business_profile_members')
      .select('id, user_id, email, permissions, status')
      .eq('business_profile_id', profile.id).in('status', ['pending', 'active'])
    const membership = memberships?.find(candidate => candidate.user_id === user.id || (normalizedEmail && candidate.email === normalizedEmail))
    if (!membership) return fromActiveCookie ? getBusinessProfileAccess(null, true) : null
    memberId = membership.id
    permissions = Array.isArray(membership.permissions)
      ? membership.permissions.filter(isBusinessPermission)
      : []
    if (permissions.length === 0) return null
    if (membership.user_id !== user.id || membership.status !== 'active') {
      await db.from('business_profile_members')
        .update({ user_id: user.id, status: 'active' }).eq('id', membership.id)
    }
  }

  const fullAccess = isOwner || isAdmin
  return {
    profile,
    user,
    role: role ?? 'user',
    isOwner,
    isAdmin,
    memberId,
    permissions: fullAccess ? [...BUSINESS_PERMISSIONS] : permissions,
    can: permission => fullAccess || permissions.includes(permission),
  }
}

export interface BusinessProfileOption {
  id: string
  name: string
  slug: string
  ownerId: string
  isOwner: boolean
  permissions: BusinessPermission[]
}

export async function listBusinessProfileOptions(): Promise<BusinessProfileOption[]> {
  const { user, role } = await getServerUser()
  if (!user) return []
  const db = createServerClient()
  const normalizedEmail = user.email?.trim().toLowerCase() ?? ''
  const [{ data: owned }, { data: byUser }, emailResult] = await Promise.all([
    db.from('business_profiles').select('id, owner_id, name, slug, status').eq('owner_id', user.id).eq('status', 'active'),
    db.from('business_profile_members').select('id, business_profile_id, user_id, permissions, status, business_profiles!inner(id, owner_id, name, slug, status)').eq('user_id', user.id).in('status', ['pending', 'active']),
    normalizedEmail
      ? db.from('business_profile_members').select('id, business_profile_id, user_id, permissions, status, business_profiles!inner(id, owner_id, name, slug, status)').eq('email', normalizedEmail).in('status', ['pending', 'active'])
      : Promise.resolve({ data: [] }),
  ])
  const options = new Map<string, BusinessProfileOption>()
  for (const profile of owned ?? []) {
    options.set(profile.id, { id: profile.id, name: profile.name, slug: profile.slug, ownerId: profile.owner_id, isOwner: true, permissions: [...BUSINESS_PERMISSIONS] })
  }
  for (const membership of [...(byUser ?? []), ...(emailResult.data ?? [])]) {
    const relation = Array.isArray(membership.business_profiles) ? membership.business_profiles[0] : membership.business_profiles
    if (!relation || relation.status !== 'active' || options.has(relation.id)) continue
    const permissions = Array.isArray(membership.permissions) ? membership.permissions.filter(isBusinessPermission) : []
    if (permissions.length === 0) continue
    options.set(relation.id, { id: relation.id, name: relation.name, slug: relation.slug, ownerId: relation.owner_id, isOwner: relation.owner_id === user.id, permissions: role === 'admin' ? [...BUSINESS_PERMISSIONS] : permissions })
    if (membership.user_id !== user.id || membership.status !== 'active') {
      await db.from('business_profile_members').update({ user_id: user.id, status: 'active' }).eq('id', membership.id)
    }
  }
  return [...options.values()].sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name, 'pl'))
}

export async function requireBusinessProfileAccessForApi(
  profileId: string | null | undefined,
  required?: BusinessPermission | readonly BusinessPermission[],
): Promise<{ error: NextResponse } | { access: BusinessProfileAccess }> {
  const access = await getBusinessProfileAccess(profileId)
  if (!access) {
    const { user } = await getServerUser()
    return { error: NextResponse.json({ error: user ? 'Brak dostępu do profilu biznesowego' : 'Zaloguj się, aby kontynuować' }, { status: user ? 403 : 401 }) }
  }
  const allowed = !required || (Array.isArray(required)
    ? required.some(permission => access.can(permission))
    : access.can(required as BusinessPermission))
  if (!allowed) return { error: NextResponse.json({ error: 'Brak wymaganego uprawnienia' }, { status: 403 }) }
  return { access }
}

export async function hasBusinessProfileAccess(): Promise<boolean> {
  return Boolean(await getBusinessProfileAccess())
}
