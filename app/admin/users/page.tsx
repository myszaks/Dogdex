import { requireRole } from '@/lib/getServerUser'
import type { Metadata } from 'next'
import AdminUsersClient from './AdminUsersClient'

export const metadata: Metadata = { title: 'Zarządzanie użytkownikami' }

export default async function AdminUsersPage() {
  await requireRole(['admin'])
  return <AdminUsersClient />
}
