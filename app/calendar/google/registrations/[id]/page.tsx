import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, CalendarPlus } from 'lucide-react'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import type { FormField } from '@/types'
import GoogleCalendarPopupLink from '@/components/GoogleCalendarPopupLink'

interface Props { params: Promise<{ id: string }> }
function one<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value }

export default async function GoogleRegistrationDatesPage({ params }: Props) {
  const { user } = await getServerUser()
  if (!user) redirect('/moje-zapisy')
  if (!hasServiceRoleKey()) redirect('/moje-zapisy')
  const { id } = await params
  const supabase = createServerClient()
  const { data: registration } = await supabase.from('registrations')
    .select('id, status, form_data, participants(user_id, owner_email, dog_name), events(title, form_fields)')
    .eq('id', id).maybeSingle()
  const participant = one(registration?.participants ?? null)
  const email = user.email?.trim().toLowerCase()
  if (!registration || (participant?.user_id !== user.id && participant?.owner_email?.trim().toLowerCase() !== email)) notFound()
  const event = one(registration.events)
  if (!event) notFound()
  const fields = (Array.isArray(event.form_fields) ? event.form_fields : []) as FormField[]
  const dates = [...new Set(fields.filter(field => field.type === 'multidate').flatMap(field => {
    const value = registration.form_data?.[field.id]
    return Array.isArray(value) ? value.filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) : []
  }))].sort()
  if (dates.length === 0) redirect(`/api/calendar/google/registrations/${registration.id}`)

  return (
    <div className="mx-auto max-w-2xl py-8">
      <Link href="/moje-zapisy" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Wróć do zapisów
      </Link>
      <section className="card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-accent/10 p-3 text-accent"><CalendarPlus className="h-6 w-6" /></div>
          <div>
            <p className="section-eyebrow">Google Calendar</p>
            <h1 className="font-heading text-2xl font-semibold">Dodaj terminy osobno</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Twój zapis na „{event.title}” obejmuje kilka dni. Otwórz każdy termin i zatwierdź go w Google Calendar.
            </p>
          </div>
        </div>
        <div className="mt-7 space-y-3">
          {dates.map(date => (
            <GoogleCalendarPopupLink
              key={date}
              href={`/api/calendar/google/registrations/${registration.id}?date=${encodeURIComponent(date)}`}
              label={new Date(`${date}T12:00:00Z`).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              presentation="date"
              className="flex items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3 transition-colors hover:border-accent hover:bg-accent/5"
            />
          ))}
        </div>
      </section>
    </div>
  )
}
