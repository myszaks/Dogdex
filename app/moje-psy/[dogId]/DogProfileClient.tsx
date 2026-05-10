'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Dog } from '@/types'
import { AGILITY_LEVELS, GENDER_LABELS } from '@/components/DogForm'
import DogForm from '@/components/DogForm'
import { useRouter } from 'next/navigation'

interface HistoryEntry {
  regId: string
  eventId: string
  eventTitle: string
  eventDate: string | null
  status: string
  rank: number | null
  time_ms: number | null
  notes: string | null
}

interface Props {
  dog: Dog
  history: HistoryEntry[]
  isEditMode: boolean
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Potwierdzony',
  pending: 'Oczekujący',
  cancelled: 'Anulowany',
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function formatTime(ms: number | null) {
  if (ms == null) return null
  return (ms / 1000).toFixed(2) + ' s'
}

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function DogProfileClient({ dog, history, isEditMode }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'info' | 'history' | 'trophy'>('info')
  const [editing, setEditing] = useState(isEditMode)
  const [error, setError] = useState<string | null>(null)

  const podium = history.filter(h => h.rank !== null && h.rank <= 3 && h.rank >= 1)
  const gender = dog.gender ? GENDER_LABELS[dog.gender] : null
  const agility = AGILITY_LEVELS.find(l => l.value === dog.agility_level)?.label
  const vaccineExpiry = dog.rabies_vaccine_expiry ? new Date(dog.rabies_vaccine_expiry) : null
  const vaccineExpired = vaccineExpiry && vaccineExpiry < new Date()

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

  if (editing) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setEditing(false)} className="text-sky-600 hover:underline text-sm">← Anuluj</button>
          <h1 className="page-title mb-0">✏️ Edytuj: {dog.name}</h1>
        </div>
        <div className="card">
          <DogForm initial={dog} onSave={handleSave} onCancel={() => setEditing(false)} />
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="card flex gap-5 mb-6">
        {dog.photo_url ? (
          <img src={dog.photo_url} alt={dog.name} className="w-24 h-24 rounded-xl object-cover shrink-0" />
        ) : (
          <div className="w-24 h-24 rounded-xl bg-slate-100 flex items-center justify-center text-5xl shrink-0">🐕</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{dog.name}</h1>
              {dog.breed && <p className="text-slate-500">{dog.breed}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setEditing(true)} className="btn btn-secondary btn-sm">✏️ Edytuj</button>
              <Link href="/moje-psy" className="btn btn-secondary btn-sm">← Moje psy</Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {gender && <span className="badge">{gender}</span>}
            {agility && <span className="badge badge-yellow">🏅 {agility}</span>}
            {dog.weight_kg && <span className="badge">{dog.weight_kg} kg</span>}
            {dog.height_cm && <span className="badge">{dog.height_cm} cm</span>}
            {vaccineExpiry && (
              <span className={`badge ${vaccineExpired ? 'badge-red' : 'badge-green'}`}>
                💉 {vaccineExpired ? '⚠️ ' : ''}Wścieklizna do: {vaccineExpiry.toLocaleDateString('pl-PL')}
              </span>
            )}
            {podium.length > 0 && (
              <span className="badge badge-yellow">🏆 {podium.length} {podium.length === 1 ? 'medal' : 'medale'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'info', label: '📋 Info' },
          { key: 'history', label: `📅 Historia (${history.length})` },
          { key: 'trophy', label: `🏆 Gablota (${podium.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {tab === 'info' && (
        <div className="card">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {[
              { label: 'Imię', value: dog.name },
              { label: 'Rasa', value: dog.breed },
              { label: 'Płeć', value: gender },
              { label: 'Umaszczenie', value: dog.coat_color },
              { label: 'Waga', value: dog.weight_kg ? `${dog.weight_kg} kg` : null },
              { label: 'Wzrost w kłębie', value: dog.height_cm ? `${dog.height_cm} cm` : null },
              { label: 'Rodowód / chip', value: dog.pedigree_or_chip },
              { label: 'Poziom agility', value: agility },
              { label: 'Szczepienie (wścieklizna)', value: vaccineExpiry ? vaccineExpiry.toLocaleDateString('pl-PL') : null },
            ].filter(r => r.value).map(row => (
              <div key={row.label} className="border-b border-slate-100 pb-2">
                <dt className="text-slate-400 text-xs">{row.label}</dt>
                <dd className="font-medium text-slate-700">{row.value}</dd>
              </div>
            ))}
          </dl>
          {error && <p className="text-red-600 text-sm mt-4">⚠️ {error}</p>}
        </div>
      )}

      {/* Tab: Historia */}
      {tab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="card text-center py-10 text-slate-400">Brak historii zawodów</div>
          ) : history.map(h => (
            <div key={h.regId} className="card flex items-start gap-4">
              <div className="text-3xl">{h.rank ? (MEDAL[h.rank] ?? '🏅') : '📋'}</div>
              <div className="flex-1 min-w-0">
                <Link href={`/events/${h.eventId}`} className="font-semibold text-sky-700 hover:underline">{h.eventTitle}</Link>
                {h.eventDate && <p className="text-slate-400 text-xs mt-0.5">{formatDate(h.eventDate)}</p>}
                <div className="flex flex-wrap gap-2 mt-1 text-xs">
                  <span className="badge">{STATUS_LABEL[h.status] ?? h.status}</span>
                  {h.rank && <span className="badge badge-yellow">Miejsce: {h.rank}</span>}
                  {h.time_ms && <span className="badge">⏱ {formatTime(h.time_ms)}</span>}
                </div>
                {h.notes && <p className="text-slate-500 text-xs mt-1 italic">{h.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Gablota */}
      {tab === 'trophy' && (
        <div>
          {podium.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-4xl mb-3">🏆</p>
              <p className="text-slate-400">Jeszcze żadnych medali — czas to zmienić!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {podium.map(h => (
                <div key={h.regId} className="card text-center py-8">
                  <div className="text-6xl mb-3">{MEDAL[h.rank!] ?? '🏅'}</div>
                  <p className="font-bold text-slate-800 text-sm">{h.eventTitle}</p>
                  {h.eventDate && <p className="text-slate-400 text-xs mt-1">{formatDate(h.eventDate)}</p>}
                  {h.time_ms && <p className="text-slate-500 text-xs mt-1">⏱ {formatTime(h.time_ms)}</p>}
                  <span className="badge badge-yellow mt-2 inline-block">
                    {h.rank === 1 ? '🥇 1. miejsce' : h.rank === 2 ? '🥈 2. miejsce' : '🥉 3. miejsce'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
