import { createAuthClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import { extractSizeClassFromRegistration } from '@/lib/speedway'
import type { SizeClass } from '@/lib/speedway'
import CheckInClient from '@/components/CheckInClient'
import type { Metadata } from 'next'
import Link from 'next/link'

interface Props {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = { title: 'Odprawa' }
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function CheckInPage({ params }: Props) {
  const { eventId: param } = await params
  const supabase = await createAuthClient()

  const { data: event } = await supabase
    .from('events').select('id, slug, title, event_type_id')
    .eq(UUID_RE.test(param) ? 'id' : 'slug', param).single()
  if (!event) notFound()
  const eventId = event.id

  const { data: registrations } = await supabase
    .from('registrations')
    .select('id, checked_in, form_data, participants(id, dog_name, owner_name, dog_breed, dogs(height_cm, breed))')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const participants = (registrations ?? []).map((r: any) => {
    const pid = r.participants?.id ?? r.id
    const dogHeightCm = Array.isArray(r.participants?.dogs)
      ? r.participants.dogs[0]?.height_cm
      : r.participants?.dogs?.height_cm
    const profileBreed = Array.isArray(r.participants?.dogs)
      ? r.participants.dogs[0]?.breed
      : r.participants?.dogs?.breed
    const sizeClass: SizeClass = extractSizeClassFromRegistration(
      r.form_data as Record<string, unknown>,
      dogHeightCm,
      r.participants?.dog_breed,
      profileBreed,
    ) ?? 'M'
    return {
      registrationId: r.id as string,
      participantId: pid as string,
      dogName: (r.participants?.dog_name ?? '') as string,
      ownerName: (r.participants?.owner_name ?? '') as string,
      sizeClass,
      checkedIn: Boolean(r.checked_in),
    }
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/organizer/events/${event.slug}/registrations`}
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          ← Zapisy
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="page-title mb-0">🐾 Odprawa – {event.title}</h1>
      </div>

      <CheckInClient eventId={eventId} initialParticipants={participants} />
    </div>
  )
}
