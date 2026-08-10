import { notFound } from 'next/navigation'
import EventTeamManager from '@/components/EventTeamManager'
import { getEventAccess, isEventTeamPermission } from '@/lib/eventAccess'
import { createServerClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export default async function EventTeamPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const access = await getEventAccess(eventId)
  if (!access?.canManageTeam) notFound()
  const supabase = createServerClient()
  const { data: members } = await supabase
    .from('event_team_members')
    .select('id, email, user_id, permissions, status')
    .eq('event_id', access.event.id)
    .order('email')
  const { data: organizerMembers } = await supabase
    .from('organizer_team_members')
    .select('id, email, user_id, default_permissions, status')
    .eq('organizer_id', access.event.created_by)
    .in('status', ['pending', 'active'])
    .order('email')
  const userIds = [...new Set([
    ...(members ?? []).map(member => member.user_id),
    ...(organizerMembers ?? []).map(member => member.user_id),
  ].filter(Boolean))] as string[]
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> }
  const names = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name]))
  const { data: ownerProfile } = await supabase.from('profiles').select('full_name').eq('id', access.event.created_by).maybeSingle()
  const { data: ownerAuth } = await supabase.auth.admin.getUserById(access.event.created_by)

  return (
    <EventTeamManager
      eventSlug={access.event.slug}
      owner={{ email: ownerAuth.user?.email ?? 'Właściciel wydarzenia', fullName: ownerProfile?.full_name ?? null }}
      initialMembers={(members ?? []).map(member => ({
        ...member,
        fullName: member.user_id ? names.get(member.user_id) ?? null : null,
        permissions: Array.isArray(member.permissions) ? member.permissions.filter(isEventTeamPermission) : [],
        status: member.status === 'active' ? 'active' as const : 'pending' as const,
      }))}
      organizerMembers={(organizerMembers ?? []).map(member => ({
        id: member.id,
        email: member.email,
        user_id: member.user_id,
        fullName: member.user_id ? names.get(member.user_id) ?? null : null,
        default_permissions: Array.isArray(member.default_permissions)
          ? member.default_permissions.filter(isEventTeamPermission)
          : [],
      }))}
      showOrganizerTeamLink={access.isOwner}
    />
  )
}
