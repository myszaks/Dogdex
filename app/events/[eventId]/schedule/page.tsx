import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ eventId: string }>
}

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId: param } = await params
  const supabase = createServerClient()
  const { data } = await supabase
    .from('events')
    .select('title')
    .eq(UUID_RE.test(param) ? 'id' : 'slug', param)
    .maybeSingle()
  return { title: `Grafik – ${data?.title ?? 'Wydarzenie'}` }
}

export default async function PublicSchedulePage({ params }: Props) {
  const { eventId: param } = await params
  const supabase = createServerClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_at, location, slug, form_fields')
    .eq(UUID_RE.test(param) ? 'id' : 'slug', param)
    .maybeSingle()

  if (!event) notFound()

  const { user } = await getServerUser()

  const { data: slots } = await supabase
    .from('time_slots')
    .select('*')
    .eq('event_id', event.id)
    .order('slot_date', { ascending: true })
    .order('slot_time', { ascending: true })

  // Fetch all confirmed registrations for this event
  const { data: registrations } = await supabase
    .from('registrations')
    .select('id, form_data, participants(dog_name, owner_name, owner_email, user_id, dog_id)')
    .eq('event_id', event.id)
    .eq('status', 'confirmed')

  const authSupabase = user?.id ? await createAuthClient() : null
  const { data: userDogs } = authSupabase && user?.id
    ? await authSupabase.from('dogs').select('id').eq('user_id', user.id)
    : { data: [] }

  const userEmail = user?.email?.trim().toLowerCase() ?? null
  const userDogIds = new Set((userDogs ?? []).map(d => d.id as string))

  // A user can have multiple registrations for one event (for multiple dogs or dates).
  // Treat any matching confirmed registration as access to the detailed public schedule.
  const isRegistered = Boolean(user) && (registrations ?? []).some(r => {
    const p = (r as Record<string, unknown>).participants as Record<string, string | null> | null
    const participantEmail = typeof p?.owner_email === 'string'
      ? p.owner_email.trim().toLowerCase()
      : null

    return (
      (p?.user_id && p.user_id === user?.id) ||
      (userEmail && participantEmail === userEmail) ||
      (p?.dog_id && userDogIds.has(p.dog_id))
    )
  })

  const regIds = (registrations ?? []).map(r => r.id as string)

  const multiDateFieldIds: string[] = Array.isArray((event as Record<string, unknown>).form_fields)
    ? ((event as Record<string, unknown>).form_fields as Array<{ id: string; type: string }>)
        .filter(field => field.type === 'multidate')
        .map(field => field.id)
    : []

  const regDatesById = new Map(
    (registrations ?? []).map(r => {
      const formData = (r as Record<string, unknown>).form_data as Record<string, unknown> | null
      const selectedDates = multiDateFieldIds.flatMap(fieldId =>
        Array.isArray(formData?.[fieldId]) ? (formData?.[fieldId] as string[]) : []
      )
      return [r.id as string, new Set(selectedDates)]
    })
  )

  // Fetch schedule_assignments to know which slot each registration is in
  const { data: assignments } = regIds.length
    ? await supabase
        .from('schedule_assignments')
        .select('registration_id, time_slot_id, item_date')
        .in('registration_id', regIds)
    : { data: [] }

  // Build a map: slot_id → list of participants
  type ParticipantEntry = { dog_name: string | null; owner_name: string | null }
  const regById = new Map(
    (registrations ?? []).map(r => {
      const p = (r as Record<string, unknown>).participants as Record<string, string> | null
      return [r.id as string, { dog_name: p?.dog_name ?? null, owner_name: p?.owner_name ?? null }]
    })
  )
  const participantsBySlot = new Map<string, ParticipantEntry[]>()
  for (const a of assignments ?? []) {
    if (!a.time_slot_id) continue
    const entry = regById.get(a.registration_id)
    if (!entry) continue

    const selectedDates = regDatesById.get(a.registration_id)
    if (selectedDates && selectedDates.size > 0) {
      if (!a.item_date || !selectedDates.has(a.item_date)) continue
    }

    if (!participantsBySlot.has(a.time_slot_id)) participantsBySlot.set(a.time_slot_id, [])
    participantsBySlot.get(a.time_slot_id)!.push(entry)
  }

  // Only show slots that have at least one participant assigned
  const filledSlots = (slots ?? []).filter(s => (participantsBySlot.get(s.id)?.length ?? 0) > 0)

  const backLink = (
    <Link href={`/events/${event.slug}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-600 mb-5 transition-colors">
      ← Powrót do wydarzenia
    </Link>
  )

  if (filledSlots.length === 0) {
    return (
      <div>
        {backLink}
        <h1 className="page-title">📅 Grafik godzinowy</h1>
        <div className="card text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">🕐</p>
          <p className="font-medium">Grafik nie został jeszcze opublikowany</p>
          <p className="text-sm mt-1">Sprawdź ponownie wkrótce</p>
        </div>
      </div>
    )
  }

  // Group filled slots by date
  const slotsByDate = new Map<string, typeof filledSlots>()
  for (const slot of filledSlots) {
    if (!slotsByDate.has(slot.slot_date)) slotsByDate.set(slot.slot_date, [])
    slotsByDate.get(slot.slot_date)!.push(slot)
  }

  // ── Not registered: show limited view (times + occupancy only) ──────────
  if (!isRegistered) {
    return (
      <div>
        {backLink}
        <h1 className="page-title">📅 Grafik godzinowy</h1>
        <p className="text-slate-500 mb-4">{event.title}</p>

        <div className="card bg-sky-50 border-sky-200 mb-6 flex items-start gap-3">
          <span className="text-2xl">🔒</span>
          <div>
            <p className="font-medium text-sky-800">Widoczny tylko dla zapisanych uczestników</p>
            <p className="text-sm text-sky-600 mt-0.5">
              Szczegóły harmonogramu (imiona i psy) są dostępne wyłącznie dla osób potwierdzonych na to wydarzenie.
              Poniżej widoczna jest liczba wolnych i zajętych miejsc.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {[...slotsByDate.entries()].map(([date, dateSlots]) => {
            const formattedDate = new Intl.DateTimeFormat('pl-PL', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            }).format(new Date(date))

            return (
              <div key={date}>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 capitalize">
                  {formattedDate}
                </h2>
                <div className="space-y-2">
                  {dateSlots.map(slot => {
                    const count = participantsBySlot.get(slot.id)?.length ?? 0
                    const max = slot.max_participants
                    const free = max !== null ? Math.max(0, max - count) : null
                    return (
                      <div key={slot.id} className="card">
                        <div className="flex items-center gap-4">
                          <div className="text-center shrink-0 w-14">
                            <p className="text-xl font-bold text-sky-600">
                              {slot.slot_time.slice(0, 5)}
                            </p>
                            {slot.label && (
                              <p className="text-xs text-slate-400 mt-0.5 leading-tight">{slot.label}</p>
                            )}
                          </div>
                          <div>
                            {max !== null ? (
                              free === 0
                                ? <span className="badge badge-red">Brak miejsc</span>
                                : <span className="badge badge-green">Wolne miejsca: {free}</span>
                            ) : (
                              <span className="text-sm text-slate-500">Zajęte: {count}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Registered: show full schedule ──────────────────────────────────────
  return (
    <div>
      {backLink}

      <h1 className="page-title">📅 Grafik godzinowy</h1>
      <p className="text-slate-500 mb-6">{event.title}</p>

      <div className="space-y-6">
        {[...slotsByDate.entries()].map(([date, dateSlots]) => {
          const formattedDate = new Intl.DateTimeFormat('pl-PL', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          }).format(new Date(date))

          return (
            <div key={date}>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 capitalize">
                {formattedDate}
              </h2>
              <div className="space-y-2">
                {dateSlots.map(slot => {
                  const inSlot = participantsBySlot.get(slot.id) ?? []
                  return (
                    <div key={slot.id} className="card">
                      <div className="flex items-start gap-4">
                        <div className="text-center shrink-0 w-14">
                          <p className="text-xl font-bold text-sky-600">
                            {slot.slot_time.slice(0, 5)}
                          </p>
                          {slot.label && (
                            <p className="text-xs text-slate-400 mt-0.5 leading-tight">{slot.label}</p>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap gap-2">
                            {inSlot.map((p, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-3 py-1 text-sm text-slate-700"
                              >
                                🐕 <span className="font-medium">{p.dog_name ?? '—'}</span>
                                <span className="text-slate-400">({p.owner_name ?? '—'})</span>
                              </span>
                            ))}
                          </div>
                          {slot.max_participants !== null && (
                            <p className="text-xs text-slate-400 mt-1">
                              {inSlot.length} / {slot.max_participants} miejsc
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
