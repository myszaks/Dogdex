import ManagementWorkspaceShell from '@/components/ManagementWorkspaceShell'
import { getServerUser } from '@/lib/getServerUser'
import { getBusinessProfileAccess, listBusinessProfileOptions } from '@/lib/businessAccess'
import { isPayoutRole } from '@/lib/roles'
import { redirect } from 'next/navigation'

export default async function PaymentsLayout({ children }: { children: React.ReactNode }) {
  const [{ user, role }, businessAccess, businessProfiles] = await Promise.all([getServerUser(), getBusinessProfileAccess(), listBusinessProfileOptions()])
  if (!user) redirect('/')
  const businessPaymentsAccess = Boolean(businessAccess?.can('payments.view'))
  if (!isPayoutRole(role) && !businessPaymentsAccess) redirect('/manage')
  return <ManagementWorkspaceShell role={role} businessProfileAccess={Boolean(businessAccess?.can('team.manage'))} businessPaymentsAccess={businessPaymentsAccess} businessProfiles={businessProfiles} activeBusinessProfileId={businessAccess?.profile.id ?? null} businessPermissions={businessAccess?.permissions ?? []}>{children}</ManagementWorkspaceShell>
}
