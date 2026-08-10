import type { BusinessPermission } from '@/lib/businessPermissions'
import type { EventTeamPermission } from '@/lib/eventPermissions'
import type { createServerClient } from '@/lib/supabaseServer'

const EVENT_PERMISSION_MAP: Partial<Record<BusinessPermission, EventTeamPermission>> = {
  'events.registrations': 'registrations',
  'events.checkin': 'checkin',
  'events.results': 'results',
  'events.finance': 'finance',
}

export function eventPermissionsFromBusiness(permissions: readonly BusinessPermission[]): EventTeamPermission[] {
  return [...new Set(permissions.map(permission => EVENT_PERMISSION_MAP[permission]).filter((value): value is EventTeamPermission => Boolean(value)))]
}

export async function syncLegacyEventTeam(
  db: ReturnType<typeof createServerClient>,
  input: {
    profileOwnerId: string
    email: string
    userId: string | null
    permissions: readonly BusinessPermission[]
    status: 'pending' | 'active' | 'disabled'
    actorId: string
  },
) {
  const eventPermissions = eventPermissionsFromBusiness(input.permissions)
  const { data: existing } = await db.from('organizer_team_members').select('id')
    .eq('organizer_id', input.profileOwnerId).eq('email', input.email).maybeSingle()

  if (input.status === 'disabled' || eventPermissions.length === 0) {
    if (existing) {
      await db.from('event_team_members').delete().eq('organizer_team_member_id', existing.id)
      await db.from('organizer_team_members').delete().eq('id', existing.id)
    }
    return
  }

  const payload = {
    organizer_id: input.profileOwnerId,
    email: input.email,
    user_id: input.userId,
    default_permissions: eventPermissions,
    auto_assign_new_events: true,
    status: input.userId ? 'active' : 'pending',
    invited_by: input.actorId,
  }
  const { data: legacy } = await db.from('organizer_team_members')
    .upsert(payload, { onConflict: 'organizer_id,email' }).select('id').single()
  if (!legacy) return

  const { data: events } = await db.from('events').select('id').eq('created_by', input.profileOwnerId)
  const assignments = (events ?? []).map(event => ({
    event_id: event.id,
    email: input.email,
    user_id: input.userId,
    permissions: eventPermissions,
    status: input.userId ? 'active' : 'pending',
    invited_by: input.actorId,
    organizer_team_member_id: legacy.id,
  }))
  if (assignments.length > 0) {
    await db.from('event_team_members').upsert(assignments, { onConflict: 'event_id,email', ignoreDuplicates: true })
    await db.from('event_team_members').update({ organizer_team_member_id: legacy.id })
      .in('event_id', events!.map(event => event.id)).eq('email', input.email).is('organizer_team_member_id', null)
  }
}
