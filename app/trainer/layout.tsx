import ManagementWorkspaceShell from '@/components/ManagementWorkspaceShell'
import { getServerUser } from '@/lib/getServerUser'
import { getBusinessProfileAccess, listBusinessProfileOptions } from '@/lib/businessAccess'
import { isTrainerRole } from '@/lib/roles'
import { BUSINESS_TRAINING_WORKSPACE_PERMISSIONS } from '@/lib/businessPermissions'
import { redirect } from 'next/navigation'

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const [{ user, role }, businessAccess, businessProfiles] = await Promise.all([getServerUser(), getBusinessProfileAccess(), listBusinessProfileOptions()])
  if (!user) redirect('/')
  const businessTrainingAccess = Boolean(businessAccess && BUSINESS_TRAINING_WORKSPACE_PERMISSIONS.some(permission => businessAccess.can(permission)))
  if (!isTrainerRole(role) && !businessTrainingAccess) redirect('/manage')
  return <ManagementWorkspaceShell role={role} businessProfileAccess={Boolean(businessAccess?.can('team.manage'))} businessTrainingAccess={businessTrainingAccess} businessPaymentsAccess={Boolean(businessAccess?.can('payments.view'))} businessProfiles={businessProfiles} activeBusinessProfileId={businessAccess?.profile.id ?? null} businessPermissions={businessAccess?.permissions ?? []}>{children}</ManagementWorkspaceShell>
}
