import { createServerClient } from '@/lib/supabaseServer'
import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { formatDate, formatTime, effectiveStatus, statusLabel, statusColor } from '@/lib/utils'
import { SIZE_CLASSES, SIZE_CLASS_LABELS, formatRunTime, medalEmoji, computeStoredSpeedKmh } from '@/lib/speedway'
import type { SizeClass } from '@/lib/speedway'
import type { Metadata } from 'next'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveArchiveEvent(param: string) {
  const supabase = createServerClient()
  const { data: bySlug } = await supabase.from('events').select('*').eq('slug', param).maybeSingle()
  if (bySlug) return { event: bySlug, redirectTo: null }
  if (UUID_RE.test(param)) {
    const { data: byId } = await supabase.from('events').select('*').eq('id', param).maybeSingle()
    if (byId) {
      const target = `/archive/${byId.slug}`
      return { event: byId, redirectTo: target }
    }
  }
  return { event: null, redirectTo: null }
}

interface Props {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params
  const { event } = await resolveArchiveEvent(eventId)
  return { title: event?.title ?? 'Wydarzenie' }
}

export const revalidate = 120

export default async function EventArchivePage({ params }: Props) {
  const { eventId } = await params
  const { event, redirectTo } = await resolveArchiveEvent(eventId)
  if (!event) notFound()
  if (event.status === 'draft') notFound()
  if (redirectTo) redirect(redirectTo)

  const supabase = createServerClient()
  const { data: rawResults } = await supabase
    .from('results')
    .select('*, participants(dog_name, owner_name, dog_breed)')
    .eq('event_id', event.id)
    .order('class_rank', { ascending: true, nullsFirst: false })

  const isSpeedway = event.event_type_id === 'speedway'
  let results = rawResults ?? []

  if (isSpeedway) {
    const { data: checkedInRegistrations } = await supabase
      .from('registrations')
      .select('participant_id')
      .eq('event_id', event.id)
      .eq('status', 'confirmed')
      .eq('checked_in', true)

    const checkedInParticipantIds = new Set(
      (checkedInRegistrations ?? []).map(reg => reg.participant_id as string)
    )
    results = results.filter((r: any) => checkedInParticipantIds.has(r.participant_id as string))
  }

  const distanceM: number | null = event.track_distance_m ?? null

  const dispStatus = effectiveStatus(event)
  const mapsQuery = event.location ? encodeURIComponent(event.location) : null

  return (
    <div>
      {/* Back link */}
      <Link href="/archive" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-600 mb-5 transition-colors">
        ← Powrót do archiwum
      </Link>

      {/* Hero */}
      {event.image_url ? (
        <div className="relative w-full aspect-[3/1] rounded-2xl overflow-hidden mb-6 shadow">
          <Image src={event.image_url} alt={event.title} fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 p-5">
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight drop-shadow">{event.title}</h1>
          </div>
        </div>
      ) : (
        <div className="relative w-full h-40 rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-sky-100 to-blue-200 flex items-center justify-center">
          <span className="text-7xl">🐾</span>
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 p-5">
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight drop-shadow">{event.title}</h1>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: details + map + results */}
        <div className="lg:col-span-2 space-y-5">

          {/* Info card */}
          <div className="card space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`badge ${statusColor(dispStatus)} text-sm`}>{statusLabel(dispStatus)}</span>
              {event.organizer_name && (
                <span className="text-sm text-slate-500">👤 {event.organizer_name}</span>
              )}
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {event.start_at && (
                <div>
                  <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Początek</dt>
                  <dd className="text-slate-800 font-medium">📅 {formatDate(event.start_at)}</dd>
                </div>
              )}
              {event.end_at && (
                <div>
                  <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Koniec</dt>
                  <dd className="text-slate-700">📅 {formatDate(event.end_at)}</dd>
                </div>
              )}
              {event.location && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Lokalizacja</dt>
                  <dd className="text-slate-800 font-medium">📍 {event.location}</dd>
                </div>
              )}
            </dl>

            {event.description && (
              <div className="border-t border-slate-100 pt-4">
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">{event.description}</p>
              </div>
            )}
          </div>

          {/* Google Maps */}
          {mapsQuery && (
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">📍 Mapa dojazdu</h2>
              </div>
              <iframe
                title="Mapa lokalizacji"
                src={`https://maps.google.com/maps?q=${mapsQuery}&output=embed&hl=pl`}
                className="w-full h-64 sm:h-80 border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}

          {/* Results */}
          {event.has_results && results && results.length > 0 && (
            <div>
              <h2 className="section-title">🏆 Wyniki</h2>

              {isSpeedway ? (
                /* ── Speedway: per-class tables ── */
                <div className="space-y-6">
                  {SIZE_CLASSES.map(cls => {
                    const classResults = results
                      .filter((r: any) => r.size_class === cls)
                      .sort((a: any, b: any) => {
                        if (a.class_rank && b.class_rank) return a.class_rank - b.class_rank
                        if (a.best_ms && b.best_ms) return a.best_ms - b.best_ms
                        return 0
                      })
                    if (classResults.length === 0) return null

                    return (
                      <section key={cls}>
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">
                          Klasa {SIZE_CLASS_LABELS[cls as SizeClass]}
                        </h3>
                        <div className="card overflow-x-auto p-0">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-slate-500 border-b bg-slate-50">
                                <th className="px-4 py-3">#</th>
                                <th className="px-4 py-3">Pies</th>
                                <th className="px-4 py-3 hidden sm:table-cell">Właściciel</th>
                                <th className="px-4 py-3 font-mono">Przebieg 1</th>
                                <th className="px-4 py-3 font-mono">Przebieg 2</th>
                                <th className="px-4 py-3 font-mono">Najlepszy</th>
                                {distanceM && <th className="px-4 py-3 hidden md:table-cell">km/h</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {classResults.map((r: any) => (
                                <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                                  <td className="px-4 py-3 text-lg font-bold">
                                    {r.class_rank ? medalEmoji(r.class_rank) : '—'}
                                  </td>
                                  <td className="px-4 py-3 font-medium">{r.participants?.dog_name ?? '—'}</td>
                                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{r.participants?.owner_name ?? '—'}</td>
                                  <td className="px-4 py-3 font-mono text-slate-600">{r.run1_ms ? formatRunTime(r.run1_ms) : '—'}</td>
                                  <td className="px-4 py-3 font-mono text-slate-600">{r.run2_ms ? formatRunTime(r.run2_ms) : '—'}</td>
                                  <td className="px-4 py-3 font-mono font-semibold text-sky-700">
                                    {r.best_ms ? formatRunTime(r.best_ms) : '—'}
                                  </td>
                                  {distanceM && (
                                    <td className="px-4 py-3 font-mono text-slate-500 hidden md:table-cell">
                                      {r.best_ms ? (computeStoredSpeedKmh(r.best_ms, distanceM)?.toFixed(2) ?? '—') : '—'}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )
                  })}

                  {/* Overall fastest / slowest */}
                  {(() => {
                    const withBest = [...results]
                      .filter((r: any) => r.best_ms !== null)
                      .sort((a: any, b: any) => a.best_ms - b.best_ms)
                    const fastest = withBest[0]
                    const slowest = withBest[withBest.length - 1]
                    if (!fastest) return null
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                          <p className="text-xs text-green-600 font-semibold mb-1">⚡ Najszybszy pies zawodów</p>
                          <p className="font-bold text-green-800">{fastest.participants?.dog_name ?? '—'}</p>
                          <p className="text-sm text-green-600">{fastest.participants?.owner_name ?? '—'} · klasa {fastest.size_class}</p>
                          <p className="font-mono text-green-700 mt-1">
                            {formatRunTime(fastest.best_ms)}
                            {distanceM && (() => {
                              const speed = computeStoredSpeedKmh(fastest.best_ms, distanceM)
                              return speed !== null ? ` · ${speed.toFixed(2)} km/h` : ''
                            })()}
                          </p>
                        </div>
                        {slowest && slowest.id !== fastest.id && (
                          <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
                            <p className="text-xs text-orange-600 font-semibold mb-1">🐢 Najwolniejszy pies zawodów</p>
                            <p className="font-bold text-orange-800">{slowest.participants?.dog_name ?? '—'}</p>
                            <p className="text-sm text-orange-600">{slowest.participants?.owner_name ?? '—'} · klasa {slowest.size_class}</p>
                            <p className="font-mono text-orange-700 mt-1">
                              {formatRunTime(slowest.best_ms)}
                              {distanceM && (() => {
                                const speed = computeStoredSpeedKmh(slowest.best_ms, distanceM)
                                return speed !== null ? ` · ${speed.toFixed(2)} km/h` : ''
                              })()}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ) : (
                /* ── Standard results table ── */
                <div className="card overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b bg-slate-50">
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Pies</th>
                        <th className="px-4 py-3">Właściciel</th>
                        <th className="px-4 py-3 hidden sm:table-cell">Rasa</th>
                        <th className="px-4 py-3">Czas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...results].sort((a: any, b: any) => (a.rank ?? 999) - (b.rank ?? 999)).map((r: any) => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="px-4 py-3 font-bold text-lg">
                            {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}
                          </td>
                          <td className="px-4 py-3 font-medium">{r.participants?.dog_name ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{r.participants?.owner_name ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">{r.participants?.dog_breed ?? '—'}</td>
                          <td className="px-4 py-3 font-mono">{formatTime(r.time_ms)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right: summary sidebar */}
        <div className="space-y-4">
          <div className="card bg-slate-50">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-3">Podsumowanie</p>
            <div className="space-y-2 text-sm">
              {event.start_at && (
                <p className="text-slate-700">📅 {formatDate(event.start_at)}</p>
              )}
              {event.location && (
                <p className="text-slate-700">📍 {event.location}</p>
              )}
              {event.organizer_name && (
                <p className="text-slate-700">👤 {event.organizer_name}</p>
              )}
            </div>
          </div>

          {results && results.length > 0 && !isSpeedway && (
            <div className="card">
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-3">Podium</p>
              <div className="space-y-2">
                {[...results].sort((a: any, b: any) => (a.rank ?? 999) - (b.rank ?? 999)).slice(0, 3).map((r: any) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <span className="text-lg">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : '🥉'}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{r.participants?.dog_name ?? '—'}</p>
                      <p className="text-xs text-slate-400 truncate">{r.participants?.owner_name ?? '—'}</p>
                    </div>
                    <span className="ml-auto font-mono text-xs text-slate-500 shrink-0">{formatTime(r.time_ms)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
