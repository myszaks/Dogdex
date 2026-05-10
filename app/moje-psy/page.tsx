import { redirect } from 'next/navigation'
import { createAuthClient } from '@/lib/supabaseServer'
import type { Metadata } from 'next'
import MojePsyClient from './MojePsyClient'

export const metadata: Metadata = { title: 'Moje psy' }
export const dynamic = 'force-dynamic'

export default async function MojePsyPage() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/')

  const supabase = await createAuthClient()
  const { data: dogs } = await supabase
    .from('dogs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  return (
    <div>
      <h1 className="page-title">🐕 Moje psy</h1>
      <p className="text-slate-500 text-sm mb-6">
        Profile Twoich psów – dane uzupełniane automatycznie przy zapisach na wydarzenia.
      </p>
      <MojePsyClient initialDogs={dogs ?? []} />
    </div>
  )
}
