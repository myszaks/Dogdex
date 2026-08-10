'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Dog } from '@/types'
import type { DogDocument } from '@/lib/dogDocuments'
import { AGILITY_LEVELS, GENDER_LABELS } from '@/components/DogForm'
import DogForm from '@/components/DogForm'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Pencil, CalendarDays, Trophy,
  Weight, Ruler, Syringe, PawPrint, Medal, Clock, X, BadgeCheck, FileCheck2,
} from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import DogDocumentsManager from '@/components/DogDocumentsManager'
import { buildSportDisciplineSummaries, buildSportPassportBadges } from '@/lib/dogSportPassport'
import { EVENT_TYPES } from '@/lib/eventTypes'

interface HistoryEntry {
  regId: string
  eventSlug: string
  eventTitle: string
  eventDate: string | null
  eventTypeId: string | null
  eventStatus: string | null
  status: string
  rank: number | null
  rankSource: 'overall' | 'class' | null
  sizeClass: string | null
  hasResult: boolean
  time_ms: number | null
  notes: string | null
}

interface Props {
  dog: Dog
  history: HistoryEntry[]
  documents: DogDocument[]
  isEditMode: boolean
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Potwierdzony', className: 'bg-emerald-100 text-emerald-700' },
  pending:   { label: 'Oczekujący',   className: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'Anulowany',    className: 'bg-red-100 text-red-700' },
}

const MEDAL_CONFIG: Record<number, { emoji: string; label: string; className: string }> = {
  1: { emoji: '🥇', label: '1. miejsce', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  2: { emoji: '🥈', label: '2. miejsce', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  3: { emoji: '🥉', label: '3. miejsce', className: 'bg-orange-100 text-orange-700 border-orange-200' },
}

function formatEventDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function eventHref(h: HistoryEntry) {
  if (!h.eventSlug) return '#'
  return h.eventStatus === 'finished' || h.eventStatus === 'cancelled'
    ? `/archive/${h.eventSlug}`
    : `/events/${h.eventSlug}`
}

function placementContext(h: HistoryEntry) {
  if (h.rankSource === 'class') {
    return h.sizeClass ? `Klasa ${h.sizeClass}` : 'Miejsce w klasie'
  }
  return null
}

type Tab = 'history' | 'trophy' | 'documents'

export default function DogProfileClient({ dog, history, documents, isEditMode }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('history')
  const [editing, setEditing] = useState(isEditMode)

  const today = new Date()
  const finishedStarts = history.filter(h => h.status === 'confirmed' && h.eventStatus === 'finished')
  const finishedResults = history.filter(h => h.status === 'confirmed' && h.hasResult && h.eventStatus === 'finished')
  const podium = finishedResults.filter(h => h.rank !== null && h.rank! >= 1 && h.rank! <= 3)
  const firstPlaces = podium.filter(h => h.rank === 1).length
  const disciplineSummaries = buildSportDisciplineSummaries(history)
  const passportBadges = buildSportPassportBadges(history)
  const gender = dog.gender ? GENDER_LABELS[dog.gender] : null
  const agility = AGILITY_LEVELS.find(l => l.value === dog.agility_level)?.label
  const vaccineExpiry = dog.rabies_vaccine_expiry ? new Date(dog.rabies_vaccine_expiry) : null
  const vaccineExpired = vaccineExpiry !== null && vaccineExpiry < today
  const daysLeft = vaccineExpiry
    ? Math.ceil((vaccineExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null
  const vaccinePct = daysLeft !== null
    ? Math.max(0, Math.min(100, Math.round((daysLeft / 365) * 100)))
    : 0

  const infoRows = [
    { label: 'Płeć',          value: gender },
    { label: 'Umaszczenie',   value: dog.coat_color },
    { label: 'Rodowód / chip', value: dog.pedigree_or_chip },
    { label: 'Poziom agility', value: agility },
    { label: 'Data urodzenia', value: dog.birth_date ? new Date(dog.birth_date).toLocaleDateString('pl-PL') : null },
  ].filter(r => r.value)

  async function handleSave(data: Partial<Dog>) {
    const res = await fetch(`/api/dogs/${dog.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Błąd zapisu')
    setEditing(false)
    router.refresh()
  }

  return (
    <div>
      <Link
        href="/moje-psy"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Moje psy
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* LEFT SIDEBAR - Forest Green */}
        <div className="lg:sticky lg:top-24">
          <div className="bg-primary rounded-3xl overflow-hidden shadow-lg">

            {/* Hero photo */}
            <div className="relative">
              {dog.photo_url ? (
                <img
                  src={dog.photo_url}
                  alt={dog.name}
                  className="w-full aspect-square object-cover"
                />
              ) : (
                <div className="w-full aspect-square bg-[#162d27] flex items-center justify-center">
                  <PawPrint className="w-20 h-20 text-white/20" />
                </div>
              )}
              {/* Name + breed overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#1E3932] via-[#1E3932]/80 to-transparent px-5 pt-10 pb-5">
                <h1 className="font-heading font-bold text-2xl text-white leading-tight">{dog.name}</h1>
                {dog.breed && (
                  <p className="text-white/60 text-sm mt-0.5">{dog.breed}</p>
                )}
                {agility && (
                  <p className="text-accent text-xs font-semibold uppercase tracking-wide mt-1">{agility}</p>
                )}
              </div>
            </div>

            <div className="p-5 space-y-5">

              {/* Orange CTA */}
              <button
                onClick={() => setEditing(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-orange-600 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Edytuj profil
              </button>

              {/* Physicality chips */}
              {(dog.weight_kg || dog.height_cm) && (
                <div className="flex gap-3">
                  {dog.weight_kg && (
                    <div className="flex-1 bg-white/10 rounded-xl p-3 text-center">
                      <Weight className="w-4 h-4 text-white/50 mx-auto mb-1" />
                      <p className="text-white font-bold text-lg leading-none">{dog.weight_kg}</p>
                      <p className="text-white/50 text-xs mt-0.5">kg</p>
                    </div>
                  )}
                  {dog.height_cm && (
                    <div className="flex-1 bg-white/10 rounded-xl p-3 text-center">
                      <Ruler className="w-4 h-4 text-white/50 mx-auto mb-1" />
                      <p className="text-white font-bold text-lg leading-none">{dog.height_cm}</p>
                      <p className="text-white/50 text-xs mt-0.5">cm</p>
                    </div>
                  )}
                </div>
              )}

              {/* Info rows */}
              {infoRows.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">
                    Informacje
                  </p>
                  <dl className="space-y-2.5">
                    {infoRows.map(row => (
                      <div
                        key={row.label}
                        className="flex justify-between gap-3 border-b border-white/10 pb-2.5 last:border-0 last:pb-0"
                      >
                        <dt className="text-white/50 text-xs">{row.label}</dt>
                        <dd className="text-white text-xs font-medium text-right">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* RIGHT CONTENT */}
        <div className="lg:col-span-2 space-y-5">

          {/* Metric cards */}
          <div className={cn('grid gap-4', vaccineExpiry ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>

            {/* Vaccine countdown */}
            {vaccineExpiry && (
              <div className="bg-card rounded-3xl p-6 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                      Szczepienie
                    </p>
                    <p className="font-heading font-semibold text-foreground text-lg leading-tight">
                      Wścieklizna
                    </p>
                  </div>
                  <div className={cn(
                    'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0',
                    vaccineExpired ? 'bg-red-100' : 'bg-emerald-100'
                  )}>
                    <Syringe className={cn('w-5 h-5', vaccineExpired ? 'text-red-600' : 'text-emerald-600')} />
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden mb-3">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      vaccineExpired
                        ? 'bg-red-500'
                        : vaccinePct < 20 ? 'bg-amber-500' : 'bg-primary'
                    )}
                    style={{ width: `${vaccinePct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{vaccineExpired ? 'Wygasło' : `${daysLeft} dni`}</span>
                  <span>{vaccineExpiry.toLocaleDateString('pl-PL')}</span>
                </div>
              </div>
            )}

            {/* Career achievements */}
            <div className="bg-card rounded-3xl p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                Osiągnięcia
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="font-heading font-bold text-3xl text-foreground leading-none">{firstPlaces}</p>
                  <p className="text-xs text-muted-foreground mt-1">Złoto</p>
                </div>
                <div>
                  <p className="font-heading font-bold text-3xl text-foreground leading-none">{podium.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Podium</p>
                </div>
                <div>
                  <p className="font-heading font-bold text-3xl text-foreground leading-none">{finishedStarts.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Starty</p>
                </div>
              </div>
            </div>

          </div>

          <section className="bg-card rounded-3xl p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent"><BadgeCheck className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-accent">Sportowy paszport</p>
                <h2 className="mt-1 font-heading text-xl font-bold">Kariera {dog.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Automatyczne podsumowanie potwierdzonych startów i wyników.</p>
              </div>
            </div>

            {disciplineSummaries.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {disciplineSummaries.map(summary => (
                  <div key={summary.eventTypeId} className="rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{eventTypeLabel(summary.eventTypeId)}</p>
                      {summary.bestRank !== null && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Najlepiej: {summary.bestRank}.</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                      <div><strong className="block text-lg text-foreground">{summary.starts}</strong>starty</div>
                      <div><strong className="block text-lg text-foreground">{summary.podiums}</strong>podia</div>
                      <div><strong className="block text-lg text-foreground">{summary.wins}</strong>wygrane</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-5 rounded-2xl bg-secondary/50 px-4 py-5 text-center text-sm text-muted-foreground">Pierwsza dyscyplina pojawi się po ukończonym wydarzeniu.</p>}

            <div className="mt-5 flex flex-wrap gap-2">
              {passportBadges.map(badge => (
                <span key={badge.key} title={badge.description} className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold',
                  badge.earned ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-border bg-secondary/40 text-muted-foreground opacity-60',
                )}>
                  {badge.earned ? '✓ ' : ''}{badge.label}
                </span>
              ))}
            </div>
          </section>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-secondary rounded-2xl">
            {([
              { key: 'history' as Tab, label: 'Historia', icon: CalendarDays, count: history.length },
              { key: 'trophy'  as Tab, label: 'Gablota',  icon: Trophy,       count: podium.length },
              { key: 'documents' as Tab, label: 'Dokumenty', icon: FileCheck2, count: documents.length },
            ]).map(t => {
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                    tab === t.key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                  <span className={cn(
                    'ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold',
                    tab === t.key ? 'bg-primary text-white' : 'bg-border text-muted-foreground'
                  )}>
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>

          <div>
          {/* Tab: Historia */}
          {tab === 'history' && (
            history.length === 0 ? (
              <div className="bg-card rounded-3xl p-14 text-center shadow-sm">
                <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
                  <CalendarDays className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="font-heading font-semibold text-foreground">Brak historii zawodów</p>
                <p className="text-muted-foreground text-sm mt-1">Pojawi się tu po zapisie na pierwsze wydarzenie.</p>
              </div>
            ) : (
              <div className="bg-card rounded-3xl shadow-sm overflow-y-auto max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary sticky top-0 z-10">
                      <th className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-6 py-3.5">
                        Wydarzenie
                      </th>
                      <th className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-3 py-3.5 hidden sm:table-cell">
                        Data
                      </th>
                      <th className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground px-3 py-3.5">
                        Status
                      </th>
                      <th className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground px-3 py-3.5">
                        Miejsce
                      </th>
                      <th className="text-right text-xs font-semibold uppercase tracking-widest text-muted-foreground px-6 py-3.5 hidden md:table-cell">
                        Czas
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map(h => {
                      const statusCfg = STATUS_CONFIG[h.status] ?? { label: h.status, className: 'bg-secondary text-foreground' }
                      const medalCfg = h.rank ? MEDAL_CONFIG[h.rank] : null
                      const placeContext = placementContext(h)
                      return (
                        <tr key={h.regId} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-6 py-4">
                            <Link
                              href={eventHref(h)}
                              className="font-semibold text-foreground hover:text-accent transition-colors line-clamp-1"
                            >
                              {h.eventTitle}
                            </Link>
                            {h.notes && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">{h.notes}</p>
                            )}
                          </td>
                          <td className="px-3 py-4 hidden sm:table-cell whitespace-nowrap text-muted-foreground">
                            {formatEventDate(h.eventDate) ?? '—'}
                          </td>
                          <td className="px-3 py-4 text-center">
                            <span className={cn('inline-flex px-2.5 py-1 rounded-full text-xs font-semibold', statusCfg.className)}>
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-center">
                            {medalCfg ? (
                              <div className="inline-flex flex-col items-center gap-1">
                                <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border', medalCfg.className)}>
                                  {medalCfg.emoji} {h.rank}
                                </span>
                                {placeContext && (
                                  <span className="text-[10px] font-medium text-muted-foreground">{placeContext}</span>
                                )}
                              </div>
                            ) : h.rank ? (
                              <div className="inline-flex flex-col items-center gap-1">
                                <span className="text-muted-foreground">{h.rank}.</span>
                                {placeContext && (
                                  <span className="text-[10px] font-medium text-muted-foreground">{placeContext}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right hidden md:table-cell text-muted-foreground">
                            {h.time_ms != null ? (
                              <span className="inline-flex items-center justify-end gap-1">
                                <Clock className="w-3 h-3" />{formatTime(h.time_ms)}
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Tab: Gablota */}
          {tab === 'trophy' && (
            podium.length === 0 ? (
              <div className="bg-card rounded-3xl p-14 text-center shadow-sm">
                <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
                  <Trophy className="w-7 h-7 text-amber-400" />
                </div>
                <p className="font-heading font-semibold text-foreground">Jeszcze żadnych medali</p>
                <p className="text-muted-foreground text-sm mt-1">Czas to zmienić na zawodach!</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {podium.map(h => {
                  const mc = MEDAL_CONFIG[h.rank!]
                  const placeContext = placementContext(h)
                  return (
                    <div key={h.regId} className="bg-card rounded-3xl p-6 text-center shadow-sm hover:shadow-md transition-shadow">
                      <div className="text-5xl mb-3">{mc.emoji}</div>
                      <p className="font-heading font-bold text-foreground text-sm line-clamp-2">{h.eventTitle}</p>
                      {h.eventDate && (
                        <p className="text-xs text-muted-foreground mt-1">{formatEventDate(h.eventDate)}</p>
                      )}
                      {h.time_ms != null && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" />{formatTime(h.time_ms)}
                        </p>
                      )}
                      <span className={cn('inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full text-xs font-semibold border', mc.className)}>
                        <Medal className="w-3 h-3" />{mc.label}
                      </span>
                      {placeContext && (
                        <p className="text-xs font-medium text-muted-foreground mt-2">{placeContext}</p>
                      )}
                    </div>
                  )
                })}
              </div>
              </div>
            )
          )}

          {tab === 'documents' && (
            <DogDocumentsManager dogId={dog.id} initialDocuments={documents} />
          )}
          </div>

        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-card rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
              <h2 className="font-heading font-bold text-foreground text-lg">Edytuj: {dog.name}</h2>
              <button
                onClick={() => setEditing(false)}
                className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-border transition-colors"
                aria-label="Zamknij"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <DogForm initial={dog} onSave={handleSave} onCancel={() => setEditing(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function eventTypeLabel(eventTypeId: string) {
  if (eventTypeId === 'other') return 'Inne wydarzenia'
  return EVENT_TYPES.find(type => type.id === eventTypeId)?.name ?? eventTypeId
}
