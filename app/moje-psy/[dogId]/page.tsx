import { redirect, notFound } from 'next/navigation'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import type { Metadata } from 'next'
import DogProfileClient from './DogProfileClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: { dogId: string }
  searchParams: { edit?: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerClient()
  const { data } = await supabase.from('dogs').select('name').eq('id', params.dogId).single()
  return { title: data?.name ? `${data.name} – profil psa` : 'Profil psa' }
}

export default async function DogProfilePage({ params, searchParams }: Props) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/')

  const supabase = createServerClient()

  // Pobierz psa (tylko własny)
  const { data: dog } = await supabase
    .from('dogs')
    .select('*')
    .eq('id', params.dogId)
    .eq('user_id', user.id)
    .single()

  if (!dog) notFound()

  // Historia: rejestracje powiązane przez dog_id lub email+imię psa
  // Łączymy registrations → participants (dog_id = dog.id) → events
  // Fallback: email match + dog_name match (stare zapisy bez dog_id)
  const [{ data: regsByDogId }, { data: regsByEmail }] = await Promise.all([
    supabase
      .from('registrations')
      .select('id, status, events(id, title, start_at), participants(dog_id)')
      .eq('participants.dog_id', dog.id),
    supabase
      .from('registrations')
      .select('id, status, events(id, title, start_at), participants(dog_name, owner_email, dog_id)')
      .ilike('participants.owner_email', user.email ?? '')
      .ilike('participants.dog_name', dog.name),
  ])

  // Zbierz unikalne rejestracje
  const allRegs = new Map<string, any>()
  for (const r of [...(regsByDogId ?? []), ...(regsByEmail ?? [])]) {
    if (r && r.id) allRegs.set(r.id, r)
  }

  // Pobierz wyniki dla tych rejestracji przez participant_id
  const regIds = Array.from(allRegs.keys())

  let results: any[] = []
  if (regIds.length > 0) {
    // Pobierz participant_ids dla tych rejestracji
    const { data: regWithPart } = await supabase
      .from('registrations')
      .select('id, participant_id')
      .in('id', regIds)

    const participantIds = regWithPart?.map(r => r.participant_id).filter(Boolean) ?? []

    if (participantIds.length > 0) {
      const { data: res } = await supabase
        .from('results')
        .select('participant_id, rank, time_ms, notes, event_id')
        .in('participant_id', participantIds)
      results = res ?? []
    }
  }

  // Zbuduj historię
  const history = Array.from(allRegs.values()).map((r: any) => {
    const result = results.find(res => res.event_id === r.events?.id) ?? null
    return {
      regId: r.id,
      eventId: r.events?.id ?? '',
      eventTitle: r.events?.title ?? 'Wydarzenie',
      eventDate: r.events?.start_at ?? null,
      status: r.status,
      rank: result?.rank ?? null,
      time_ms: result?.time_ms ?? null,
      notes: result?.notes ?? null,
    }
  }).sort((a, b) => (b.eventDate ?? '').localeCompare(a.eventDate ?? ''))

  return (
    <DogProfileClient
      dog={dog}
      history={history}
      isEditMode={searchParams.edit === '1'}
    />
  )
}
