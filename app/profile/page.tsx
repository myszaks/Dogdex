import { redirect } from 'next/navigation'
import { createAuthClient } from '@/lib/supabaseServer'
import type { Metadata } from 'next'
import ProfileClient from './ProfileClient'
import PersonalWorkspaceShell from '@/components/PersonalWorkspaceShell'

export const metadata: Metadata = { title: 'Mój Dogdex – profil' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [{ data: profile }, { count: registrationCount }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, company, role, created_at')
      .eq('id', user.id)
      .single(),
    supabase
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .ilike('owner_email', user.email ?? ''),
  ])

  return (
    <PersonalWorkspaceShell>
      <ProfileClient
        email={user.email ?? ''}
        fullName={(profile as any)?.full_name ?? ''}
        company={(profile as any)?.company ?? ''}
        role={(profile as any)?.role ?? 'user'}
        createdAt={(profile as any)?.created_at ?? user.created_at}
        registrationCount={registrationCount ?? 0}
      />
    </PersonalWorkspaceShell>
  )
}
