'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Star, MapPin, Clock } from 'lucide-react'
import type { TrainerProfile } from '@/types'

export default function TrainingsPage() {
  const [trainers, setTrainers] = useState<TrainerProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/trainers')
      .then(r => r.json())
      .then(data => {
        setTrainers(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(err => {
        setError('Błąd przy ładowaniu trenerów')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-slate-500">Ładowanie trenerów…</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="page-title mb-2">Treningi Indywidualne</h1>
        <p className="text-muted-foreground">
          Znajdź i zarezerwuj trening z doświadczonym trenerem psów
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {trainers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 mb-4">Brak dostępnych trenerów</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {trainers.map(trainer => (
            <Link key={trainer.id} href={`/trainings/${trainer.trainer_id}`}>
              <div className="card hover:shadow-lg transition-shadow cursor-pointer h-full">
                {/* Image */}
                {trainer.profile_image_url ? (
                  <div className="relative h-48 bg-slate-200 rounded-t-2xl overflow-hidden">
                    <img
                      src={trainer.profile_image_url}
                      alt={trainer.full_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="relative h-48 bg-gradient-to-br from-accent/20 to-accent/5 rounded-t-2xl flex items-center justify-center">
                    <div className="text-4xl">🐕</div>
                  </div>
                )}

                {/* Content */}
                <div className="p-5">
                  <h3 className="font-heading font-semibold text-lg text-foreground mb-1">
                    {trainer.full_name}
                  </h3>

                  {trainer.location_city && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <MapPin className="w-4 h-4" />
                      <span>{trainer.location_city}</span>
                    </div>
                  )}

                  {trainer.bio && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {trainer.bio}
                    </p>
                  )}

                  {trainer.price_per_hour && (
                    <div className="flex items-center gap-2 text-sm font-semibold text-accent">
                      <Clock className="w-4 h-4" />
                      <span>
                        {trainer.price_per_hour.toLocaleString('pl-PL', {
                          style: 'currency',
                          currency: 'PLN',
                        })}/h
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
