import { requireRole } from '@/lib/getServerUser'
import Link from 'next/link'
import type { Metadata } from 'next'
import AdminUsersClient from './AdminUsersClient'

export const metadata: Metadata = { title: 'Zarządzanie użytkownikami' }

export default async function AdminUsersPage() {
  await requireRole(['admin'])
  return (
    <div>
      <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        ← Profil
      </Link>
      <AdminUsersClient />
    </div>
  )
}
