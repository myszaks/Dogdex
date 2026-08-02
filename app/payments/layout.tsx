import ManagementWorkspaceShell from '@/components/ManagementWorkspaceShell'
import { requireRole } from '@/lib/getServerUser'

export default async function PaymentsLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireRole(['organizer', 'trainer', 'admin'])
  return <ManagementWorkspaceShell role={role}>{children}</ManagementWorkspaceShell>
}
