import { requireRole } from '@/lib/getServerUser'

interface LayoutProps {
  children: React.ReactNode
}

export default async function OrganizerLayout({ children }: LayoutProps) {
  await requireRole(['organizer', 'admin'])

  return children
}
