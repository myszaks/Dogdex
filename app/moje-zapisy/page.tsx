import { createServerClient } from '@/lib/supabaseServer'
import { createAuthClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import RegistrationEventCard from '@/components/RegistrationEventCard'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Moje zapisy' }
export const dynamic = 'force-dynamic'

export default async function MyRegistrationsPage() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user || !user.email) redirect('/')

  const supabase = createServerClient()

  const { data: participants } = await supabase
    .from('participants')
    .select('id')
    .ilike('owner_email', user.email)

  const participantIds = participants?.map(p => p.id) ?? []

  const registrations = participantIds.length > 0
    ? (await supabase
        .from('registrations')
        .select('*, participants(*), events(*)')
        .in('participant_id', participantIds)
        .order('created_at', { ascending: false })
      ).data ?? []
    : []

  return (
    <div>
      <h1 className="page-title">📋 Moje zapisy</h1>
      <p className="text-slate-500 text-sm mb-6">Zapisy powiązane z adresem: <strong>{user.email}</strong></p>

      {registrations.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-5xl mb-4">🐾</p>
          <p className="text-slate-500 font-medium">Brak zapisów</p>
          <p className="text-slate-400 text-sm mt-1">Zapisz się na wydarzenie, żeby zobaczyć je tutaj.</p>
          <Link href="/" className="btn btn-primary btn-sm mt-4 inline-flex">
            Przeglądaj wydarzenia
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {registrations.map((reg: any) => (
            <RegistrationEventCard
              key={reg.id}
              event={reg.events}
              registration={{ id: reg.id, status: reg.status, created_at: reg.created_at, form_data: reg.form_data }}
              participant={reg.participants}
            />
          ))}
        </div>
      )}
    </div>
  )
}
