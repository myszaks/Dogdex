'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, MapPin, Search, SlidersHorizontal, Star } from 'lucide-react'
import type { TrainerProfileWithStats } from '@/types'

interface Filters {
  q: string
  city: string
  specialization: string
  maxPrice: string
  minRating: string
  sort: string
}

const EMPTY_FILTERS: Filters = {
  q: '',
  city: '',
  specialization: '',
  maxPrice: '',
  minRating: '',
  sort: 'rating',
}

export default function TrainingsPage() {
  const [trainers, setTrainers] = useState<TrainerProfileWithStats[]>([])
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    if (filters.q) params.set('q', filters.q)
    if (filters.city) params.set('city', filters.city)
    if (filters.specialization) params.set('specialization', filters.specialization)
    if (filters.maxPrice) params.set('max_price', filters.maxPrice)
    if (filters.minRating) params.set('min_rating', filters.minRating)
    params.set('sort', filters.sort)

    setLoading(true)
    setError(null)
    fetch(`/api/trainers?${params}`)
      .then(async response => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Nie udało się pobrać trenerów')
        return data
      })
      .then(data => {
        if (!cancelled) setTrainers(Array.isArray(data) ? data : [])
      })
      .catch(loadError => {
        if (!cancelled) setError((loadError as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFilters(draft)
  }

  const clear = () => {
    setDraft(EMPTY_FILTERS)
    setFilters(EMPTY_FILTERS)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="page-title mb-2">Treningi indywidualne</h1>
        <p className="text-muted-foreground">Znajdź trenera dopasowanego do potrzeb Twojego psa.</p>
      </div>

      <form onSubmit={submit} className="card p-5 mb-8">
        <div className="flex items-center gap-2 font-semibold mb-4">
          <SlidersHorizontal className="w-5 h-5 text-accent" />
          Wyszukiwanie i filtry
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <input
            aria-label="Szukaj trenera"
            value={draft.q}
            onChange={event => setDraft(current => ({ ...current, q: event.target.value }))}
            className="form-input lg:col-span-2"
            placeholder="Imię, opis lub rodzaj treningu"
          />
          <input
            aria-label="Miasto"
            value={draft.city}
            onChange={event => setDraft(current => ({ ...current, city: event.target.value }))}
            className="form-input"
            placeholder="Miasto"
          />
          <input
            aria-label="Specjalizacja"
            value={draft.specialization}
            onChange={event => setDraft(current => ({ ...current, specialization: event.target.value }))}
            className="form-input"
            placeholder="Specjalizacja"
          />
          <input
            aria-label="Maksymalna cena"
            type="number"
            min="0"
            value={draft.maxPrice}
            onChange={event => setDraft(current => ({ ...current, maxPrice: event.target.value }))}
            className="form-input"
            placeholder="Cena maks."
          />
          <select
            aria-label="Minimalna ocena"
            value={draft.minRating}
            onChange={event => setDraft(current => ({ ...current, minRating: event.target.value }))}
            className="form-input"
          >
            <option value="">Dowolna ocena</option>
            <option value="4">Od 4,0</option>
            <option value="4.5">Od 4,5</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <select
            aria-label="Sortowanie"
            value={draft.sort}
            onChange={event => setDraft(current => ({ ...current, sort: event.target.value }))}
            className="form-input max-w-56"
          >
            <option value="rating">Najlepiej oceniani</option>
            <option value="price_asc">Cena rosnąco</option>
            <option value="price_desc">Cena malejąco</option>
            <option value="name">Nazwa A–Z</option>
          </select>
          <button type="submit" className="btn btn-primary">
            <Search className="w-4 h-4" />
            Szukaj
          </button>
          <button type="button" onClick={clear} className="btn btn-secondary">Wyczyść</button>
        </div>
      </form>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>}
      {loading && <div className="text-center text-slate-500 py-12">Ładowanie trenerów…</div>}

      {!loading && trainers.length === 0 && (
        <div className="text-center py-12 text-slate-500">Brak trenerów spełniających wybrane kryteria.</div>
      )}

      {!loading && trainers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {trainers.map(trainer => (
            <Link key={trainer.id} href={`/trainings/${trainer.slug}`} className="card hover:shadow-lg transition-shadow overflow-hidden">
              {trainer.profile_image_url ? (
                <div className="relative h-48 bg-slate-200 overflow-hidden">
                  <img src={trainer.profile_image_url} alt={trainer.full_name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-48 bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-4xl">🐕</div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-heading font-semibold text-lg">{trainer.full_name}</h2>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {trainer.rating ?? '—'}
                    <span className="font-normal text-muted-foreground">({trainer.review_count ?? 0})</span>
                  </span>
                </div>
                {trainer.location_city && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                    <MapPin className="w-4 h-4" />
                    {trainer.location_city}
                  </div>
                )}
                {trainer.bio && <p className="text-sm text-muted-foreground my-3 line-clamp-2">{trainer.bio}</p>}
                <div className="flex flex-wrap gap-2 my-3">
                  {(trainer.training_types ?? []).slice(0, 3).map(type => (
                    <span key={type.id} className="px-2 py-1 bg-accent/10 text-accent rounded-full text-xs">
                      {type.name}
                    </span>
                  ))}
                </div>
                {trainer.min_price != null && (
                  <div className="flex items-center gap-2 text-sm font-semibold text-accent">
                    <Clock className="w-4 h-4" />
                    od {trainer.min_price.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}/h
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
