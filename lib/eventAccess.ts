import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import {
  EVENT_TEAM_PERMISSIONS,
  isEventTeamPermission,
  type EventTeamPermission,
} from '@/lib/eventPermissions'
import { getBusinessProfileAccess } from '@/lib/businessAccess'

export {
  EVENT_TEAM_PERMISSIONS,
  EVENT_TEAM_PERMISSION_LABELS,
  isEventTeamPermission,
  type EventTeamPermission,
} from '@/lib/eventPermissions'

export interface EventAccess {
  event: {
    id: string
    slug: string
    title: string
    created_by: string
    business_profile_id?: string | null
    event_type_id?: string | null
    has_schedule?: boolean | null
    has_results?: boolean | null
  }
  user: NonNullable<Awaited<ReturnType<typeof getServerUser>>['user']>
  role: string
  isOwner: boolean
  isAdmin: boolean
  permissions: EventTeamPermission[]
  canManageTeam: boolean
  canEditEvent: boolean
  canManageRefunds: boolean
  can: (permission: EventTeamPermission) => boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getEventAccess(identifier: string): Promise<EventAccess | null> {
  const { user, role } = await getServerUser()
  if (!user) return null

  const supabase = createServerClient()
  const { data: event } = await supabase
    .from('events')
    .select('id, slug, title, created_by, business_profile_id, event_type_id, has_schedule, has_results')
    .eq(UUID_RE.test(identifier) ? 'id' : 'slug', identifier)
    .maybeSingle()

  if (!event) return null

  const isAdmin = role === 'admin'
  const isOwner = event.created_by === user.id
  const businessAccess = event.business_profile_id
    ? await getBusinessProfileAccess(event.business_profile_id)
    : null
  let permissions: EventTeamPermission[] = []

  if (!isAdmin && !isOwner) {
    const normalizedEmail = user.email?.trim().toLowerCase() ?? ''
    const { data: memberships } = await supabase
      .from('event_team_members')
      .select('id, user_id, email, permissions, status, organizer_team_member_id')
      .eq('event_id', event.id)
      .in('status', ['pending', 'active'])

    const membership = memberships?.find(member => (
      member.user_id === user.id
      || (normalizedEmail && member.email.toLowerCase() === normalizedEmail)
    ))
    if (!membership && !businessAccess?.can('events.edit')) return null

    permissions = Array.isArray(membership?.permissions)
      ? membership.permissions.filter(isEventTeamPermission)
      : []
    if (permissions.length === 0 && !businessAccess?.can('events.edit')) return null

    if (membership && (membership.user_id !== user.id || membership.status !== 'active')) {
      await createServerClient()
        .from('event_team_members')
        .update({ user_id: user.id, status: 'active' })
        .eq('id', membership.id)
    }
    if (membership?.organizer_team_member_id) {
      await createServerClient()
        .from('organizer_team_members')
        .update({ user_id: user.id, status: 'active' })
        .eq('id', membership.organizer_team_member_id)
    }
  }

  const fullAccess = isAdmin || isOwner
  return {
    event,
    user,
    role: role ?? 'user',
    isOwner,
    isAdmin,
    permissions: fullAccess ? [...EVENT_TEAM_PERMISSIONS] : permissions,
    canManageTeam: fullAccess,
    canEditEvent: fullAccess || Boolean(businessAccess?.can('events.edit')),
    canManageRefunds: fullAccess || Boolean(businessAccess?.can('refunds.manage')),
    can: permission => fullAccess || permissions.includes(permission),
  }
}

export async function requireEventAccessForApi(
  identifier: string,
  required?: EventTeamPermission | readonly EventTeamPermission[],
): Promise<{ error: NextResponse } | { access: EventAccess }> {
  const access = await getEventAccess(identifier)
  if (!access) {
    const { user } = await getServerUser()
    return {
      error: NextResponse.json(
        { error: user ? 'Brak uprawnień do tego wydarzenia' : 'Zaloguj się, aby kontynuować' },
        { status: user ? 403 : 401 },
      ),
    }
  }

  const allowed = !required
    || (Array.isArray(required)
      ? required.some(permission => access.can(permission))
      : access.can(required as EventTeamPermission))

  if (!allowed) {
    return { error: NextResponse.json({ error: 'Brak wymaganych uprawnień do wydarzenia' }, { status: 403 }) }
  }
  return { access }
}

export async function hasSharedEventAccess(): Promise<boolean> {
  const { user } = await getServerUser()
  if (!user) return false
  const supabase = await createAuthClient()
  const { data } = await supabase
    .from('event_team_members')
    .select('id')
    .in('status', ['pending', 'active'])
    .limit(1)
  return Boolean(data?.length)
}
