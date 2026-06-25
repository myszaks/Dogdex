import { requireRole } from '@/lib/getServerUser'

interface LayoutProps {
  children: React.ReactNode
}

export default async function TrainerLayout({ children }: LayoutProps) {
  // Ensure only organizers and admins can access trainer dashboard
  await requireRole(['organizer', 'admin'])

  return children
}
