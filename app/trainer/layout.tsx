import { requireRole } from '@/lib/getServerUser'

interface LayoutProps {
  children: React.ReactNode
}

export default async function TrainerLayout({ children }: LayoutProps) {
  await requireRole(['trainer', 'admin'])

  return children
}
