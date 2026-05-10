import { createServerClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ eventId: string }>
}

export const revalidate = 60

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params
  const supabase = createServerClient()
  const { data } = await supabase.from('events').select('title').or(`id.eq.${eventId},slug.eq.${eventId}`).maybeSingle()
  return { title: `Grafik – ${data?.title ?? 'Wydarzenie'}` }
}

export default async function PublicSchedulePage({ params }: Props) {
  const { eventId } = await params
  const supabase = createServerClient()

  // Resolve by slug or id
  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_at, location, slug')
    .or(`id.eq.${eventId},slug.eq.${eventId}`)
    .maybeSingle()

  if (!event) notFound()

  const [{ data: slots }, { data: registrations }] = await Promise.all([
    supabase
      .from('time_slots')
      .select('*')
      .eq('event_id', event.id)
      .order('slot_date', { ascending: true })
      .order('slot_time', { ascending: true }),
    supabase
      .from('registrations')
      .select('id, time_slot_id, participants(dog_name, owner_name)')
      .eq('event_id', event.id)
      .eq('status', 'confirmed')
      .not('time_slot_id', 'is', null),
  ])

  if (!slots || slots.length === 0) {
    return (
      <div>
        <Link href={`/events/${event.slug ?? event.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-600 mb-5 transition-colors">
          ← Powrót do wydarzenia
        </Link>
        <h1 className="page-title">📅 Grafik godzinowy</h1>
        <div className="card text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">🕐</p>
          <p className="font-medium">Grafik nie został jeszcze opublikowany</p>
          <p className="text-sm mt-1">Sprawdź ponownie wkrótce</p>
        </div>
      </div>
    )
  }

  // Group registrations by slot
  const regsBySlot = new Map<string, Array<{ dog_name: string | null; owner_name: string | null }>>()
  for (const reg of registrations ?? []) {
    const p = (reg as Record<string, unknown>).participants as Record<string, string> | null
    if (!reg.time_slot_id) continue
    if (!regsBySlot.has(reg.time_slot_id)) regsBySlot.set(reg.time_slot_id, [])
    regsBySlot.get(reg.time_slot_id)!.push({
      dog_name: p?.dog_name ?? null,
      owner_name: p?.owner_name ?? null,
    })
  }

  // Group slots by date
  const slotsByDate = new Map<string, typeof slots>()
  for (const slot of slots) {
    if (!slotsByDate.has(slot.slot_date)) slotsByDate.set(slot.slot_date, [])
    slotsByDate.get(slot.slot_date)!.push(slot)
  }

  return (
    <div>
      <Link
        href={`/events/${event.slug ?? event.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-600 mb-5 transition-colors"
      >
        ← Powrót do wydarzenia
      </Link>

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
                  const inSlot = regsBySlot.get(slot.id) ?? []
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
                          {inSlot.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">Brak przypisanych uczestników</p>
                          ) : (
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
                          )}
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
