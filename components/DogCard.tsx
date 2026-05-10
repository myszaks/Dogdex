'use client'
import Link from 'next/link'
import type { Dog } from '@/types'
import { AGILITY_LEVELS, GENDER_LABELS } from './DogForm'

interface Props {
  dog: Dog
  onDelete: (id: string) => void
}

export default function DogCard({ dog, onDelete }: Props) {
  const gender = dog.gender ? GENDER_LABELS[dog.gender] : null
  const agility = AGILITY_LEVELS.find(l => l.value === dog.agility_level)?.label
  const vaccineExpiry = dog.rabies_vaccine_expiry
    ? new Date(dog.rabies_vaccine_expiry)
    : null
  const vaccineExpired = vaccineExpiry && vaccineExpiry < new Date()

  return (
    <div className="card flex gap-4">
      {dog.photo_url ? (
        <img src={dog.photo_url} alt={dog.name} className="w-20 h-20 rounded-xl object-cover shrink-0" />
      ) : (
        <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center text-4xl shrink-0">🐕</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/moje-psy/${dog.id}`} className="font-bold text-lg text-sky-700 hover:underline">
              {dog.name}
            </Link>
            {dog.breed && <p className="text-slate-500 text-sm">{dog.breed}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href={`/moje-psy/${dog.id}`} className="btn btn-secondary btn-sm">Profil</Link>
            <Link href={`/moje-psy/${dog.id}?edit=1`} className="btn btn-secondary btn-sm">✏️</Link>
            <button
              onClick={() => { if (confirm(`Usunąć profil ${dog.name}?`)) onDelete(dog.id) }}
              className="btn btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
            >
              🗑️
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2 text-xs">
          {gender && <span className="badge">{gender}</span>}
          {agility && <span className="badge badge-yellow">🏅 {agility}</span>}
          {dog.weight_kg && <span className="badge">{dog.weight_kg} kg</span>}
          {dog.height_cm && <span className="badge">{dog.height_cm} cm</span>}
          {vaccineExpiry && (
            <span className={`badge ${vaccineExpired ? 'badge-red' : 'badge-green'}`}>
              💉 {vaccineExpired ? '⚠️ ' : ''}
              Wścieklizna do: {vaccineExpiry.toLocaleDateString('pl-PL')}
            </span>
          )}
        </div>
        {dog.pedigree_or_chip && (
          <p className="text-xs text-slate-400 mt-1">Chip/Rodowód: {dog.pedigree_or_chip}</p>
        )}
      </div>
    </div>
  )
}
