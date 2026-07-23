import { createAuthClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import RegistrationEventCard from '@/components/RegistrationEventCard'
import RegistrationsCalendar from '@/components/RegistrationsCalendar'
import RegistrationsAutoRefresh from '@/components/RegistrationsAutoRefresh'
import type { Metadata } from 'next'
import type { CancellationRequest } from '@/types'

export const metadata: Metadata = { title: 'Moje zapisy' }
export const dynamic = 'force-dynamic'

export default async function MyRegistrationsPage() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user || !user.email) redirect('/')

  const { data: participants } = await authClient
    .from('participants')
    .select('id')
    .ilike('owner_email', user.email)

  const participantIds = participants?.map(p => p.id) ?? []

  const registrations = participantIds.length > 0
    ? (await authClient
        .from('registrations')
        .select('*, participants(*), events(*)')
        .in('participant_id', participantIds)
        .in('status', ['confirmed', 'pending'])
        .order('created_at', { ascending: false })
      ).data ?? []
    : []

  // Fetch pending cancellation requests for all registrations
  const registrationIds = (registrations as Array<Record<string, unknown>>).map(r => r.id as string)
  const pendingRequestMap = new Map<string, CancellationRequest>()
  if (registrationIds.length > 0) {
    const { data: pendingRequests } = await authClient
      .from('cancellation_requests')
      .select('*')
      .in('registration_id', registrationIds)
      .eq('status', 'pending')
    for (const req of pendingRequests ?? []) {
      pendingRequestMap.set(req.registration_id, req as CancellationRequest)
    }
  }

  // Build flat list of specific dates from multidate form fields,
  // falling back to event start_at if no multidate selections found.
  const eventDates: { date: string; id: string; slug: string; title: string }[] = []
  const seen = new Set<string>()

  for (const reg of registrations as Array<Record<string, unknown>>) {
    const ev = reg.events as Record<string, unknown> | null
    if (!ev) continue

    const formFields = Array.isArray(ev.form_fields) ? ev.form_fields as Array<{ id: string; type: string }> : []
    const multidateFieldIds = formFields.filter(f => f.type === 'multidate').map(f => f.id)
    const formData: Record<string, unknown> = (reg.form_data as Record<string, unknown>) ?? {}

    const selectedDates: string[] = multidateFieldIds.flatMap(fieldId => {
      const val = formData[fieldId]
      if (Array.isArray(val)) return val as string[]
      if (typeof val === 'string' && val) return [val]
      return []
    })

    // If user chose specific dates — use them; otherwise fall back to event start_at
    const datesToMark = selectedDates.length > 0
      ? selectedDates
      : ev.start_at ? [(ev.start_at as string).slice(0, 10)] : []

    for (const date of datesToMark) {
      const key = `${ev.id as string}::${date}`
      if (seen.has(key)) continue
      seen.add(key)
      eventDates.push({ date: date.slice(0, 10), id: ev.id as string, slug: ev.slug as string, title: ev.title as string })
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <RegistrationsAutoRefresh />
      <div className="mb-8">
        <h1 className="page-title">Moje zapisy</h1>
      </div>

      {eventDates.length > 0 && (
        <RegistrationsCalendar eventDates={eventDates} />
      )}

      {registrations.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-16 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🐾</span>
          </div>
          <p className="font-heading font-semibold text-foreground text-lg">Brak zapisów</p>
          <p className="text-muted-foreground text-sm mt-1 mb-6">Zapisz się na wydarzenie, żeby zobaczyć je tutaj.</p>
          <Link href="/" className="btn btn-primary btn-sm inline-flex">
            Przeglądaj wydarzenia
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {registrations.map((reg: Record<string, unknown>) => (
            <RegistrationEventCard
              key={reg.id as string}
              event={reg.events as import('@/types').DogEvent}
              registration={{ id: reg.id as string, status: reg.status as string, created_at: reg.created_at as string, form_data: reg.form_data as Record<string, unknown> }}
              participant={reg.participants as import('@/types').Participant}
              pendingCancellationRequest={pendingRequestMap.get(reg.id as string) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
