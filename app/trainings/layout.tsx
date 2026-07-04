import { notFound } from 'next/navigation'
import { INDIVIDUAL_TRAININGS_ENABLED } from '@/lib/features'

interface LayoutProps {
  children: React.ReactNode
}

export default function TrainingsLayout({ children }: LayoutProps) {
  if (!INDIVIDUAL_TRAININGS_ENABLED) {
    notFound()
  }

  return children
}
