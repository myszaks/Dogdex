import ManagementWorkspaceShell from '@/components/ManagementWorkspaceShell'
import { requireRole } from '@/lib/getServerUser'

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireRole(['trainer', 'admin'])
  return <ManagementWorkspaceShell role={role}>{children}</ManagementWorkspaceShell>
}
