'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import DateAvailabilityManager from '@/components/DateAvailabilityManager'

export default function AvailabilityPage() {
  return (
    <div className="w-full">
      <Link href="/trainer" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" />
        Wróć do panelu
      </Link>

      <h1 className="font-heading font-bold text-3xl mb-8">📅 Zarządzaj dostępnością</h1>

      <DateAvailabilityManager />
    </div>
  )
}
