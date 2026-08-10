import { redirect } from 'next/navigation'
import BusinessTeamManager from '@/components/BusinessTeamManager'
import { getBusinessProfileAccess } from '@/lib/businessAccess'
import { isBusinessPermission } from '@/lib/businessPermissions'
import { createServerClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export default async function BusinessTeamPage() {
  const access = await getBusinessProfileAccess()
  if (!access) redirect('/profile/role-request')
  if (!access.can('team.manage')) redirect('/manage')
  const db = createServerClient()
  const { data: members } = await db.from('business_profile_members').select('id, email, user_id, role_title, permissions, status').eq('business_profile_id', access.profile.id).neq('user_id', access.profile.owner_id).order('email')
  const userIds = [...new Set((members ?? []).map(member => member.user_id).filter(Boolean))] as string[]
  const { data: profiles } = userIds.length ? await db.from('profiles').select('id, full_name').in('id', userIds) : { data: [] }
  const names = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name]))
  return <BusinessTeamManager profile={access.profile} initialMembers={(members ?? []).map(member => ({ ...member, fullName: member.user_id ? names.get(member.user_id) ?? null : null, permissions: Array.isArray(member.permissions) ? member.permissions.filter(isBusinessPermission) : [], status: member.status === 'active' ? 'active' as const : member.status === 'disabled' ? 'disabled' as const : 'pending' as const }))} />
}
