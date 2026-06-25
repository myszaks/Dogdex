'use client'

import { Suspense } from 'react'
import MyTrainingsContent from './MyTrainingsContent'

export default function MyTrainingsPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-12 text-center">Ladowanie...</div>}>
      <MyTrainingsContent />
    </Suspense>
  )
}
