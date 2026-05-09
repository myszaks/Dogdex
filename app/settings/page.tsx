import { redirect } from 'next/navigation'
import { createAuthClient } from '@/lib/supabaseServer'
import type { Metadata } from 'next'
import SettingsClient from './SettingsClient'

export const metadata: Metadata = { title: 'Ustawienia' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/')

  const provider = user.app_metadata?.provider ?? 'email'

  return <SettingsClient email={user.email ?? ''} provider={provider} />
}
