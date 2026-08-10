import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import RegistrationEventCard from '@/components/RegistrationEventCard'
import RegistrationsCalendar from '@/components/RegistrationsCalendar'
import type { CancellationRequest } from '@/types'
import { cn } from '@/lib/utils'
import { createAuthClient } from '@/lib/supabaseServer'
import MyTrainingsContent from '@/app/moje-treningi/MyTrainingsContent'
import { splitRegistrationHistory } from '@/lib/registrationManagement'
import PersonalWorkspaceShell from '@/components/PersonalWorkspaceShell'

export const metadata: Metadata = { title: 'Mój Dogdex – zapisy' }
export const dynamic = 'force-dynamic'

interface MyRegistrationsPageProps {
  searchParams: Promise<{
    tab?: string
    payment?: string
    booking_id?: string
  }>
}

function tabClassName(active: boolean) {
  return cn(
    'inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors',
    active
      ? 'border-accent bg-accent text-white shadow-sm'
      : 'border-border bg-card text-muted-foreground hover:border-accent/40 hover:text-foreground'
  )
}

export default async function MyRegistrationsPage({ searchParams }: MyRegistrationsPageProps) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user || !user.email) {
    redirect('/')
  }

  const { tab, payment, booking_id: paymentBookingId } = await searchParams
  const activeTab = tab === 'trainings' ? 'trainings' : 'events'

  let registrations: Array<Record<string, unknown>> = []
  const pendingRequestMap = new Map<string, CancellationRequest>()
  const calendarDates: {
    date: string
    href: string
    id: string
    kind: 'event' | 'training'
    title: string
  }[] = []

  const { data: participants } = await authClient
    .from('participants')
    .select('id')
    .ilike('owner_email', user.email)

  const participantIds = participants?.map(participant => participant.id) ?? []
  const eventRegistrations = participantIds.length > 0
    ? (await authClient
        .from('registrations')
        .select('*, participants(*), events(*)')
        .in('participant_id', participantIds)
        .in('status', ['confirmed', 'pending', 'cancelled'])
        .order('created_at', { ascending: false })
      ).data ?? []
    : []

  if (activeTab === 'events') {
    registrations = eventRegistrations
    const registrationIds = registrations.map(registration => registration.id as string)
    if (registrationIds.length > 0) {
      const { data: pendingRequests } = await authClient
        .from('cancellation_requests')
        .select('*')
        .in('registration_id', registrationIds)
        .eq('status', 'pending')

      for (const pendingRequest of pendingRequests ?? []) {
        pendingRequestMap.set(pendingRequest.registration_id, pendingRequest as CancellationRequest)
      }
    }

  }

  const seenEventDates = new Set<string>()
  for (const registration of eventRegistrations) {
    if (registration.status === 'cancelled') continue

    const event = registration.events as Record<string, unknown> | null
    if (!event) continue

    const formFields = Array.isArray(event.form_fields)
      ? event.form_fields as Array<{ id: string; type: string }>
      : []
    const multidateFieldIds = formFields
      .filter(field => field.type === 'multidate')
      .map(field => field.id)
    const formData = (registration.form_data as Record<string, unknown>) ?? {}
    const selectedDates: string[] = multidateFieldIds.flatMap(fieldId => {
      const value = formData[fieldId]
      if (Array.isArray(value)) return value as string[]
      if (typeof value === 'string' && value) return [value]
      return []
    })
    const datesToMark = selectedDates.length > 0
      ? selectedDates
      : event.start_at
        ? [(event.start_at as string).slice(0, 10)]
        : []

    for (const date of datesToMark) {
      const key = `${event.id as string}::${date}`
      if (seenEventDates.has(key)) continue

      seenEventDates.add(key)
      calendarDates.push({
        date: date.slice(0, 10),
        href: `/events/${event.slug as string}`,
        id: event.id as string,
        kind: 'event',
        title: event.title as string,
      })
    }
  }

  const { data: trainingBookings } = await authClient
    .from('training_bookings')
    .select('id, scheduled_at, training_types(name)')
    .eq('user_id', user.id)
    .neq('status', 'cancelled')

  for (const booking of trainingBookings ?? []) {
    if (!booking.scheduled_at) continue

    const trainingType = Array.isArray(booking.training_types)
      ? booking.training_types[0]
      : booking.training_types
    const trainingName = trainingType?.name || 'Trening indywidualny'
    calendarDates.push({
      date: formatCalendarDate(booking.scheduled_at),
      href: '/moje-zapisy?tab=trainings',
      id: booking.id,
      kind: 'training',
      title: `${trainingName} · ${formatCalendarTime(booking.scheduled_at)}`,
    })
  }

  const {
    active: activeRegistrations,
    cancelled: cancelledRegistrations,
  } = splitRegistrationHistory(registrations)

  const registrationsHeader = (
    <div className="pt-1">
      <h2 className="section-title mb-0 text-2xl">Zapisy</h2>
      <p className="mt-2 text-muted-foreground">
        W jednym miejscu sprawdzisz wydarzenia i treningi indywidualne.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/moje-zapisy" className={tabClassName(activeTab === 'events')}>
          Wydarzenia
        </Link>
        <Link href="/moje-zapisy?tab=trainings" className={tabClassName(activeTab === 'trainings')}>
          Treningi indywidualne
        </Link>
      </div>
    </div>
  )

  const registrationsCalendar = <RegistrationsCalendar dates={calendarDates} />

  return (
    <PersonalWorkspaceShell
      headerContent={registrationsHeader}
      headerAside={registrationsCalendar}
    >
      {activeTab === 'trainings' ? (
        <MyTrainingsContent
          embedded
          paymentStatus={payment ?? null}
          paymentBookingId={paymentBookingId ?? null}
        />
      ) : (
        <>
          {registrations.length === 0 ? (
            <div className="bg-card rounded-3xl p-16 text-center shadow-sm">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🐕</span>
              </div>
              <p className="font-heading font-semibold text-foreground text-lg">Brak zapisów</p>
              <p className="text-muted-foreground text-sm mt-1 mb-6">
                Zapisz się na wydarzenie, żeby zobaczyć je tutaj.
              </p>
              <Link href="/" className="btn btn-primary btn-sm inline-flex">
                Przeglądaj wydarzenia
              </Link>
            </div>
          ) : (
            <div className="space-y-10">
              {activeRegistrations.length > 0 && (
                <section>
                  <h2 className="mb-4 font-heading text-xl font-semibold text-foreground">
                    Aktywne zapisy
                  </h2>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {activeRegistrations.map(registration => (
                      <RegistrationEventCard
                        key={registration.id as string}
                        event={registration.events as import('@/types').DogEvent}
                        registration={{
                          id: registration.id as string,
                          status: registration.status as string,
                          created_at: registration.created_at as string,
                          form_data: registration.form_data as Record<string, unknown>,
                          checkin_token: registration.checkin_token as string | null,
                        }}
                        participant={registration.participants as import('@/types').Participant}
                        pendingCancellationRequest={pendingRequestMap.get(registration.id as string) ?? null}
                      />
                    ))}
                  </div>
                </section>
              )}

              {cancelledRegistrations.length > 0 && (
                <section>
                  <div className="mb-4 flex items-baseline gap-2">
                    <h2 className="font-heading text-xl font-semibold text-foreground">
                      Historia anulowanych
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      ({cancelledRegistrations.length})
                    </span>
                  </div>
                  <div className="grid gap-5 opacity-90 sm:grid-cols-2 lg:grid-cols-3">
                    {cancelledRegistrations.map(registration => (
                      <RegistrationEventCard
                        key={registration.id as string}
                        event={registration.events as import('@/types').DogEvent}
                        registration={{
                          id: registration.id as string,
                          status: registration.status as string,
                          created_at: registration.created_at as string,
                          form_data: registration.form_data as Record<string, unknown>,
                          checkin_token: registration.checkin_token as string | null,
                        }}
                        participant={registration.participants as import('@/types').Participant}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </PersonalWorkspaceShell>
  )
}

function formatCalendarDate(value: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function formatCalendarTime(value: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
