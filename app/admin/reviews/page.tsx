import type { Metadata } from 'next'
import { requireRole } from '@/lib/getServerUser'
import AdminReviewReportsClient from './AdminReviewReportsClient'

export const metadata: Metadata = { title: 'Moderacja opinii' }
export const dynamic = 'force-dynamic'

export default async function AdminReviewsPage() {
  await requireRole(['admin'])
  return <AdminReviewReportsClient />
}
