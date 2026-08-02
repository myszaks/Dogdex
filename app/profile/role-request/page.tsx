import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import RoleRequestClient from './RoleRequestClient'
import PersonalWorkspaceShell from '@/components/PersonalWorkspaceShell'

export const metadata: Metadata = { title: 'Mój Dogdex – role i dostęp' }
export const dynamic = 'force-dynamic'

export default async function RoleRequestPage() {
  const { user, role } = await getServerUser()
  if (!user) redirect('/')

  const supabase = await createAuthClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, company')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <PersonalWorkspaceShell>
      <RoleRequestClient
        email={user.email ?? ''}
        currentRole={role ?? 'user'}
        initialFullName={(profile?.full_name as string | null) ?? ''}
        initialBusinessName={(profile?.company as string | null) ?? ''}
      />
    </PersonalWorkspaceShell>
  )
}
