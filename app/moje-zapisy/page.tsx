import { createAuthClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import RegistrationEventCard from '@/components/RegistrationEventCard'
import RegistrationsCalendar from '@/components/RegistrationsCalendar'
import type { Metadata } from 'next'

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

  // Build flat list of specific dates from multidate form fields,
  // falling back to event start_at if no multidate selections found.
  const eventDates: { date: string; id: string; slug: string | null; title: string }[] = []
  const seen = new Set<string>()

  for (const reg of registrations as any[]) {
    const ev = reg.events
    if (!ev) continue

    const formFields: any[] = Array.isArray(ev.form_fields) ? ev.form_fields : []
    const multidateFieldIds = formFields.filter((f: any) => f.type === 'multidate').map((f: any) => f.id as string)
    const formData: Record<string, unknown> = reg.form_data ?? {}

    const selectedDates: string[] = multidateFieldIds.flatMap(fieldId => {
      const val = formData[fieldId]
      if (Array.isArray(val)) return val as string[]
      if (typeof val === 'string' && val) return [val]
      return []
    })

    // If user chose specific dates — use them; otherwise fall back to event start_at
    const datesToMark = selectedDates.length > 0
      ? selectedDates
      : ev.start_at ? [ev.start_at.slice(0, 10)] : []

    for (const date of datesToMark) {
      const key = `${ev.id}::${date}`
      if (seen.has(key)) continue
      seen.add(key)
      eventDates.push({ date: date.slice(0, 10), id: ev.id, slug: ev.slug ?? null, title: ev.title })
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
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
