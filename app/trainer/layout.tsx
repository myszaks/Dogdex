import { notFound } from 'next/navigation'
import { INDIVIDUAL_TRAININGS_ENABLED } from '@/lib/features'
import { requireRole } from '@/lib/getServerUser'

interface LayoutProps {
  children: React.ReactNode
}

export default async function TrainerLayout({ children }: LayoutProps) {
  if (!INDIVIDUAL_TRAININGS_ENABLED) {
    notFound()
  }

  await requireRole(['trainer', 'organizer', 'admin'])

  return children
}
