'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Dog } from '@/types'
import { AGILITY_LEVELS, GENDER_LABELS } from './DogForm'
import ConfirmModal from './ConfirmModal'

interface Props {
  dog: Dog
  onDelete: (id: string) => void
}

export default function DogCard({ dog, onDelete }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const gender = dog.gender ? GENDER_LABELS[dog.gender] : null
  const agility = AGILITY_LEVELS.find(l => l.value === dog.agility_level)?.label
  const vaccineExpiry = dog.rabies_vaccine_expiry
    ? new Date(dog.rabies_vaccine_expiry)
    : null
  const vaccineExpired = vaccineExpiry && vaccineExpiry < new Date()

  return (
    <div className="card hover:shadow-md transition-shadow overflow-hidden p-0 flex flex-col">
      {/* Photo */}
      <div className="relative w-full aspect-square bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
        {dog.photo_url ? (
          <img src={dog.photo_url} alt={dog.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-6xl">🐕</span>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1">
        <div className="mb-2">
          <Link href={`/moje-psy/${dog.id}`} className="font-bold text-lg text-sky-700 hover:underline leading-tight">
            {dog.name}
          </Link>
          {dog.breed && <p className="text-slate-500 text-sm mt-0.5">{dog.breed}</p>}
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs mb-3">
          {gender && <span className="badge">{gender}</span>}
          {agility && <span className="badge badge-yellow">🏅 {agility}</span>}
          {dog.weight_kg && <span className="badge">{dog.weight_kg} kg</span>}
          {dog.height_cm && <span className="badge">{dog.height_cm} cm</span>}
          {vaccineExpiry && (
            <span className={`badge ${vaccineExpired ? 'badge-red' : 'badge-green'}`}>
              💉 {vaccineExpired ? '⚠️ Przeterminowana' : vaccineExpiry.toLocaleDateString('pl-PL')}
            </span>
          )}
        </div>

        {dog.pedigree_or_chip && (
          <p className="text-xs text-slate-400 mb-3 truncate">Chip/Rodowód: {dog.pedigree_or_chip}</p>
        )}

        {/* Actions */}
        <div className="mt-auto flex gap-2">
          <Link href={`/moje-psy/${dog.id}`} className="btn btn-secondary btn-sm flex-1 text-center">
            Profil
          </Link>
          <Link href={`/moje-psy/${dog.id}?edit=1`} className="btn btn-secondary btn-sm">
            ✏️
          </Link>
          <button
            onClick={() => setConfirmOpen(true)}
            className="btn btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
          >
            🗑️
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={`Usunąć profil ${dog.name}?`}
        message="Tej operacji nie można cofnąć. Wszystkie dane psa zostaną usunięte."
        confirmLabel="Usuń"
        danger
        onConfirm={() => { setConfirmOpen(false); onDelete(dog.id) }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
