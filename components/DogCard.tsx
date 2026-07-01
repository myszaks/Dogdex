'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Dog } from '@/types'
import { AGILITY_LEVELS, GENDER_LABELS } from './DogForm'
import ConfirmModal from './ConfirmModal'
import { Pencil, Trash2, Syringe, Weight, Ruler } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  dog: Dog
  onDelete: (id: string) => void
}

export default function DogCard({ dog, onDelete }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const gender = dog.gender ? GENDER_LABELS[dog.gender] : null
  const agility = AGILITY_LEVELS.find(l => l.value === dog.agility_level)?.label
  const vaccineExpiry = dog.rabies_vaccine_expiry ? new Date(dog.rabies_vaccine_expiry) : null
  const vaccineExpired = vaccineExpiry && vaccineExpiry < new Date()

  return (
    <div className="bg-card rounded-3xl border border-border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group">
      {/* Photo */}
      <div className="relative w-full aspect-square bg-secondary overflow-hidden shrink-0">
        {dog.photo_url ? (
          <img
            src={dog.photo_url}
            alt={dog.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-7xl opacity-20">🐕</span>
          </div>
        )}
        {/* Gender badge */}
        {gender && (
          <div className="absolute top-3 right-3">
            <span className="badge badge-sage text-xs">{gender}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-5 flex flex-col flex-1">
        <div className="mb-3">
          <Link
            href={`/moje-psy/${dog.slug}`}
            className="font-heading font-bold text-lg text-foreground hover:text-primary transition-colors leading-tight block"
          >
            {dog.name}
          </Link>
          {dog.breed && (
            <p className="text-sm text-muted-foreground mt-0.5">{dog.breed}</p>
          )}
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-2 mb-3">
          {agility && (
            <span className="badge badge-yellow">🏅 {agility}</span>
          )}
          {dog.weight_kg && (
            <span className="inline-flex items-center gap-1 badge badge-sage">
              <Weight className="w-3 h-3" />{dog.weight_kg} kg
            </span>
          )}
          {dog.height_cm && (
            <span className="inline-flex items-center gap-1 badge badge-sage">
              <Ruler className="w-3 h-3" />{dog.height_cm} cm
            </span>
          )}
        </div>

        {/* Vaccine status */}
        {vaccineExpiry && (
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium mb-3',
            vaccineExpired ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          )}>
            <Syringe className="w-3.5 h-3.5 shrink-0" />
            <span>
              Wścieklizna: {vaccineExpired ? '⚠️ Przeterminowana' : vaccineExpiry.toLocaleDateString('pl-PL')}
            </span>
          </div>
        )}

        {dog.pedigree_or_chip && (
          <p className="text-xs text-muted-foreground mb-3 truncate">
            Chip/Rodowód: {dog.pedigree_or_chip}
          </p>
        )}

        {/* Actions */}
        <div className="mt-auto flex gap-2">
          <Link href={`/moje-psy/${dog.slug}`} className="btn btn-secondary btn-sm flex-1 text-center">
            Profil
          </Link>
          <Link
            href={`/moje-psy/${dog.slug}?edit=1`}
            className="btn btn-sm bg-secondary text-foreground hover:bg-border border border-border"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={() => setConfirmOpen(true)}
            className="btn btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
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

