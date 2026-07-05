import { requireRole } from '@/lib/getServerUser'
import Link from 'next/link'
import type { Metadata } from 'next'
import AdminRoleRequestsClient from './AdminRoleRequestsClient'

export const metadata: Metadata = { title: 'Wnioski o role' }
export const dynamic = 'force-dynamic'

export default async function AdminRoleRequestsPage() {
  await requireRole(['admin'])

  return (
    <div>
      <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        ← Profil
      </Link>
      <AdminRoleRequestsClient />
    </div>
  )
}
