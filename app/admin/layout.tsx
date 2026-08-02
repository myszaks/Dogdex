import ManagementWorkspaceShell from '@/components/ManagementWorkspaceShell'
import { requireRole } from '@/lib/getServerUser'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireRole(['admin'])
  return <ManagementWorkspaceShell role={role}>{children}</ManagementWorkspaceShell>
}
