import ManagementWorkspaceShell from '@/components/ManagementWorkspaceShell'
import { getServerUser } from '@/lib/getServerUser'
import { hasSharedEventAccess } from '@/lib/eventAccess'
import { redirect } from 'next/navigation'

export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await getServerUser()
  if (!user) redirect('/')
  const sharedEventAccess = await hasSharedEventAccess()
  return <ManagementWorkspaceShell role={role} sharedEventAccess={sharedEventAccess}>{children}</ManagementWorkspaceShell>
}
