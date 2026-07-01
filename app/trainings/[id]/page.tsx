'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapPin, Clock, ArrowLeft } from 'lucide-react'
import type { TrainerProfile, TrainingType } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export default function TrainerDetailPage({ params }: Props) {
  const [trainer, setTrainer] = useState<TrainerProfile & { training_types?: TrainingType[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trainerSlug, setTrainerSlug] = useState<string | null>(null)

  useEffect(() => {
    params.then(p => setTrainerSlug(p.id))
  }, [params])

  useEffect(() => {
    if (!trainerSlug) return

    fetch(`/api/trainers/${trainerSlug}`)
      .then(r => {
        if (!r.ok) throw new Error('Nie znaleziono trenera')
        return r.json()
      })
      .then(data => {
        setTrainer(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Błąd przy ładowaniu trenera')
        setLoading(false)
      })
  }, [trainerSlug])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/trainings" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" />
          Wróć do listy trenerów
        </Link>
        <div className="text-center text-slate-500">Ładowanie…</div>
      </div>
    )
  }

  if (error || !trainer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/trainings" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" />
          Wróć do listy trenerów
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Nie znaleziono trenera'}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/trainings" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" />
        Wróć do listy trenerów
      </Link>

      {/* Header Card */}
      <div className="card mb-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Image */}
          <div className="md:w-48 h-48 rounded-2xl bg-slate-200 overflow-hidden shrink-0">
            {trainer.profile_image_url ? (
              <img
                src={trainer.profile_image_url}
                alt={trainer.full_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-5xl">
                🐕
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="font-heading font-bold text-3xl mb-2">{trainer.full_name}</h1>

            {trainer.location_city && (
              <div className="flex items-center gap-2 text-muted-foreground mb-4">
                <MapPin className="w-5 h-5" />
                <span>{trainer.location_city}</span>
                {trainer.location_details && <span className="text-sm">– {trainer.location_details}</span>}
              </div>
            )}

            {trainer.bio && <p className="text-muted-foreground mb-6">{trainer.bio}</p>}

            {trainer.price_per_hour && (
              <div className="text-lg font-semibold text-accent">
                {trainer.price_per_hour.toLocaleString('pl-PL', {
                  style: 'currency',
                  currency: 'PLN',
                })}/godzina
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Training Types */}
      {trainer.training_types && trainer.training_types.length > 0 ? (
        <div>
          <h2 className="font-heading font-semibold text-2xl mb-6">Dostępne rodzaje treningów</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {trainer.training_types.map(type => (
              <Link
                key={type.id}
                href={`/trainings/${trainer.slug}/book/${type.slug}`}
                className="card hover:shadow-lg transition-all cursor-pointer group"
              >
                <div className="p-6">
                  <h3 className="font-heading font-semibold text-lg mb-2 group-hover:text-accent transition-colors">
                    {type.name}
                  </h3>

                  {type.description && (
                    <p className="text-sm text-muted-foreground mb-4">{type.description}</p>
                  )}

                  <div className="flex items-center gap-2 text-sm font-semibold text-accent">
                    <Clock className="w-4 h-4" />
                    <span>
                      {type.price_per_hour
                        ? type.price_per_hour.toLocaleString('pl-PL', {
                            style: 'currency',
                            currency: 'PLN',
                          })
                        : `${type.duration_min} min`}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          Ten trener nie ma jeszcze dostępnych rodzajów treningów
        </div>
      )}
    </div>
  )
}
