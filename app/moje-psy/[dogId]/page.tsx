import { redirect, notFound } from 'next/navigation'
import { createAuthClient } from '@/lib/supabaseServer'
import type { Metadata } from 'next'
import type { Dog } from '@/types'
import DogProfileClient from './DogProfileClient'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Props {
  params: Promise<{ dogId: string }>
  searchParams: Promise<{ edit?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dogId } = await params
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { title: 'Profil psa' }
  const query = UUID_RE.test(dogId)
    ? supabase.from('dogs').select('name').eq('id', dogId).eq('user_id', user.id)
    : supabase.from('dogs').select('name').eq('slug', dogId).eq('user_id', user.id)
  const { data } = await query.maybeSingle()
  return { title: data?.name ? `${data.name} – profil psa` : 'Profil psa' }
}

export default async function DogProfilePage({ params, searchParams }: Props) {
  const { dogId } = await params
  const { edit } = await searchParams

  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  // Resolve dog: by slug (scoped to user) or by UUID with redirect to slug
  let dog: Dog | null = null
  let redirectTo: string | null = null

  if (UUID_RE.test(dogId)) {
    const { data } = await supabase.from('dogs').select('*').eq('id', dogId).eq('user_id', user.id).maybeSingle()
    if (data) {
      dog = data
      if (data.slug) redirectTo = `/moje-psy/${data.slug}${edit === '1' ? '?edit=1' : ''}`
    }
  } else {
    const { data } = await supabase.from('dogs').select('*').eq('slug', dogId).eq('user_id', user.id).maybeSingle()
    dog = data
  }

  if (!dog) notFound()
  if (redirectTo) redirect(redirectTo)

  // Historia: rejestracje powiązane przez dog_id (nowe) lub email+imię psa bez dog_id (legacy)
  // Podejście przez participant_id zamiast filtrowania embedded table (unika cross-dog leakage)

  // Krok 1: uczestnicy z dog_id = dog.id
  const { data: participantsByDogId } = await supabase
    .from('participants')
    .select('id')
    .eq('dog_id', dog.id)

  // Krok 2: legacy uczestnicy bez dog_id (pasujący email + imię psa)
  const { data: participantsLegacy } = await supabase
    .from('participants')
    .select('id')
    .ilike('owner_email', user.email ?? '')
    .ilike('dog_name', dog.name as string)
    .is('dog_id', null)

  const allParticipantIds = [
    ...((participantsByDogId ?? []).map(p => p.id)),
    ...((participantsLegacy ?? []).map(p => p.id)),
  ].filter((id, i, arr) => arr.indexOf(id) === i) // deduplicate

  let history: any[] = []

  if (allParticipantIds.length > 0) {
    // Krok 3: rejestracje dla tych uczestników
    const { data: regs } = await supabase
      .from('registrations')
      .select('id, status, participant_id, events(id, title, start_at)')
      .in('participant_id', allParticipantIds)

    // Krok 4: wyniki – dopasowanie po participant_id (nie event_id)
    const { data: results } = await supabase
      .from('results')
      .select('participant_id, rank, time_ms, notes, event_id')
      .in('participant_id', allParticipantIds)

    const resultsMap = new Map<string, any>()
    for (const res of results ?? []) {
      resultsMap.set(res.participant_id, res)
    }

    history = (regs ?? []).map((r: any) => {
      const result = resultsMap.get(r.participant_id) ?? null
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
    }).sort((a: any, b: any) => (b.eventDate ?? '').localeCompare(a.eventDate ?? ''))
  }

  return (
    <DogProfileClient
      dog={dog}
      history={history}
      isEditMode={edit === '1'}
    />
  )
}
