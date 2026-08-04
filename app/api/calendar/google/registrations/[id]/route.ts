import { NextResponse } from 'next/server'
import { buildGoogleCalendarUrl } from '@/lib/googleCalendar'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import type { FormField } from '@/types'

interface Params { params: Promise<{ id: string }> }
function one<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value }

function selectedDates(formFields: unknown, formData: Record<string, unknown> | null) {
  const fields = (Array.isArray(formFields) ? formFields : []) as FormField[]
  return [...new Set(fields.filter(field => field.type === 'multidate').flatMap(field => {
    const value = formData?.[field.id]
    return Array.isArray(value) ? value.filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) : []
  }))].sort()
}

export async function GET(req: Request, { params }: Params) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Zaloguj się, aby dodać termin' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Brak konfiguracji kalendarza' }, { status: 503 })
  const { id } = await params
  const supabase = createServerClient()
  const { data: registration } = await supabase.from('registrations')
    .select('id, status, form_data, participants(user_id, owner_email, dog_name), events(id, slug, title, description, start_at, end_at, location, form_fields)')
    .eq('id', id).maybeSingle()
  const participant = one(registration?.participants ?? null)
  const email = user.email?.trim().toLowerCase()
  if (!registration || (participant?.user_id !== user.id && participant?.owner_email?.trim().toLowerCase() !== email)) {
    return NextResponse.json({ error: 'Nie znaleziono zapisu' }, { status: 404 })
  }
  if (registration.status === 'cancelled') return NextResponse.json({ error: 'Anulowanego zapisu nie można dodać' }, { status: 409 })
  const event = one(registration.events)
  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  const dates = selectedDates(event.form_fields, registration.form_data)
  const requestedDate = new URL(req.url).searchParams.get('date')
  if (dates.length > 1 && !requestedDate) {
    return NextResponse.redirect(new URL(`/calendar/google/registrations/${registration.id}`, req.url), 302)
  }
  if (requestedDate && !dates.includes(requestedDate)) {
    return NextResponse.json({ error: 'Ten termin nie należy do zapisu' }, { status: 400 })
  }
  const selectedDate = requestedDate ?? dates[0]
  if (!selectedDate && !event.start_at) return NextResponse.json({ error: 'Ten zapis nie ma jeszcze terminu' }, { status: 409 })
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
  return NextResponse.redirect(buildGoogleCalendarUrl({
    title: event.title,
    start: selectedDate ?? event.start_at!,
    end: selectedDate ? null : event.end_at,
    allDay: Boolean(selectedDate),
    description: [event.description, participant?.dog_name ? `Zapis z psem ${participant.dog_name}.` : null, `${baseUrl}/events/${event.slug}`].filter(Boolean).join('\n\n'),
    location: event.location,
  }), 302)
}
