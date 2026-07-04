import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { INDIVIDUAL_TRAININGS_ENABLED } from '@/lib/features'
import MyTrainingsContent from './MyTrainingsContent'

export default function MyTrainingsPage() {
  if (!INDIVIDUAL_TRAININGS_ENABLED) {
    notFound()
  }

  return (
    <Suspense fallback={
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
          ← Profil
        </Link>
        <div className="text-center">Ladowanie...</div>
      </div>
    }>
      <MyTrainingsContent />
    </Suspense>
  )
}
