import ManagementWorkspaceShell from '@/components/ManagementWorkspaceShell'
import { getServerUser } from '@/lib/getServerUser'
import { hasSharedEventAccess } from '@/lib/eventAccess'
import { getBusinessProfileAccess, listBusinessProfileOptions } from '@/lib/businessAccess'
import { BUSINESS_TRAINING_WORKSPACE_PERMISSIONS } from '@/lib/businessPermissions'
import { redirect } from 'next/navigation'

export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await getServerUser()
  if (!user) redirect('/')
  const [sharedEventAccess, businessAccess, businessProfiles] = await Promise.all([
    hasSharedEventAccess(),
    getBusinessProfileAccess(),
    listBusinessProfileOptions(),
  ])
  const businessTrainingAccess = Boolean(businessAccess && BUSINESS_TRAINING_WORKSPACE_PERMISSIONS.some(permission => businessAccess.can(permission)))
  return <ManagementWorkspaceShell role={role} sharedEventAccess={sharedEventAccess || Boolean(businessAccess?.can('events.create') || businessAccess?.can('events.edit'))} businessProfileAccess={Boolean(businessAccess?.can('team.manage'))} businessTrainingAccess={businessTrainingAccess} businessPaymentsAccess={Boolean(businessAccess?.can('payments.view'))} businessProfiles={businessProfiles} activeBusinessProfileId={businessAccess?.profile.id ?? null} businessPermissions={businessAccess?.permissions ?? []}>{children}</ManagementWorkspaceShell>
}
