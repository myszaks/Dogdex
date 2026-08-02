import { redirect } from 'next/navigation'
import { createAuthClient } from '@/lib/supabaseServer'
import type { Metadata } from 'next'
import MojePsyClient from './MojePsyClient'
import PersonalWorkspaceShell from '@/components/PersonalWorkspaceShell'

export const metadata: Metadata = { title: 'Mój Dogdex – psy' }
export const dynamic = 'force-dynamic'

export default async function MojePsyPage() {
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: dogs } = await supabase
    .from('dogs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  return (
    <PersonalWorkspaceShell>
      <div className="mb-8">
        <h2 className="section-title mb-0 text-2xl">Psy</h2>
        <p className="text-muted-foreground text-sm">
          Profile Twoich psów – dane uzupełniane automatycznie przy zapisach na wydarzenia.
        </p>
      </div>
      <MojePsyClient initialDogs={dogs ?? []} />
    </PersonalWorkspaceShell>
  )
}
