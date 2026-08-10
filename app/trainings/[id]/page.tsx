'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Clock, MapPin, ShieldCheck, Star } from 'lucide-react'
import type { TrainerProfileWithStats, TrainingReview, TrainingCourse, TrainingPassProduct } from '@/types'
import ReviewSafetyActions from '@/components/ReviewSafetyActions'
import TrainingGroupOffers from '@/components/TrainingGroupOffers'

interface Props {
  params: Promise<{ id: string }>
}

type TrainerDetails = TrainerProfileWithStats & { reviews?: TrainingReview[]; training_courses?: TrainingCourse[]; training_pass_products?: TrainingPassProduct[] }

export default function TrainerDetailPage({ params }: Props) {
  const [trainer, setTrainer] = useState<TrainerDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trainerSlug, setTrainerSlug] = useState<string | null>(null)

  useEffect(() => {
    params.then(value => setTrainerSlug(value.id))
  }, [params])

  useEffect(() => {
    if (!trainerSlug) return
    fetch(`/api/trainers/${trainerSlug}`)
      .then(async response => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Nie znaleziono trenera')
        return data
      })
      .then(data => setTrainer(data))
      .catch(loadError => setError((loadError as Error).message))
      .finally(() => setLoading(false))
  }, [trainerSlug])

  if (loading) {
    return <div className="w-full py-12 text-center text-muted-foreground">Ładowanie…</div>
  }

  if (error || !trainer) {
    return (
      <div className="w-full py-12">
        <Link href="/trainings" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" />
          Wróć do listy trenerów
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          {error || 'Nie znaleziono trenera'}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full py-8">
      <Link href="/trainings" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" />
        Wróć do listy trenerów
      </Link>

      <div className="card p-6 mb-8">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-48 h-48 rounded-2xl bg-slate-200 overflow-hidden shrink-0">
            {trainer.profile_image_url ? (
              <img src={trainer.profile_image_url} alt={trainer.full_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-5xl">🐕</div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="font-heading font-bold text-3xl">{trainer.full_name}</h1>
              <span className="inline-flex items-center gap-1 font-semibold">
                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                {trainer.rating ?? '—'}
                <span className="text-sm font-normal text-muted-foreground">({trainer.review_count ?? 0})</span>
              </span>
            </div>
            {trainer.location_city && (
              <div className="flex items-center gap-2 text-muted-foreground mb-4">
                <MapPin className="w-5 h-5" />
                <span>{trainer.location_city}</span>
                {trainer.location_details && <span className="text-sm">– {trainer.location_details}</span>}
              </div>
            )}
            {trainer.bio && <p className="text-muted-foreground mb-5">{trainer.bio}</p>}
            <div className="inline-flex items-center gap-2 text-sm bg-emerald-50 text-emerald-800 px-3 py-2 rounded-lg">
              <ShieldCheck className="w-4 h-4" />
              Bezpłatne anulowanie do {trainer.cancellation_buffer_hours} godz. przed treningiem
            </div>
          </div>
        </div>
      </div>

      {(trainer.training_types ?? []).length > 0 ? (
        <section className="mb-10">
          <h2 className="font-heading font-semibold text-2xl mb-6">Dostępne rodzaje treningów</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {trainer.training_types!.map(type => (
              <Link
                key={type.id}
                href={`/trainings/${trainer.slug}/book/${type.slug}`}
                className="card hover:shadow-lg transition-all group p-6"
              >
                <h3 className="font-heading font-semibold text-lg mb-2 group-hover:text-accent">{type.name}</h3>
                {type.description && <p className="text-sm text-muted-foreground mb-4">{type.description}</p>}
                <div className="flex items-center gap-2 text-sm font-semibold text-accent">
                  <Clock className="w-4 h-4" />
                  {Number(type.price_per_hour) > 0
                    ? `${Number(type.price_per_hour).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}/h`
                    : `Bezpłatnie · ${type.duration_min} min`}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="text-center py-12 text-slate-500">Ten trener nie ma obecnie aktywnych treningów.</div>
      )}

      <TrainingGroupOffers trainerSlug={trainer.slug} courses={trainer.training_courses ?? []} passProducts={trainer.training_pass_products ?? []} />

      <section>
        <h2 className="font-heading font-semibold text-2xl mb-6">Opinie klientów</h2>
        {(trainer.reviews ?? []).length === 0 ? (
          <div className="card p-6 text-muted-foreground">Ten trener nie ma jeszcze opinii.</div>
        ) : (
          <div className="space-y-4">
            {trainer.reviews!.map(review => (
              <article key={review.id} className="card p-5">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold">{review.author_name}</p>
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {review.rating}/5
                  </span>
                </div>
                {review.comment && <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{review.comment}</p>}
                <p className="text-xs text-muted-foreground mt-3">
                  {new Date(review.created_at).toLocaleDateString('pl-PL')}
                </p>
                <ReviewSafetyActions
                  reviewId={review.id}
                  reviewType="training"
                  ownerId={trainer.trainer_id}
                  authorUserId={review.user_id}
                  isVerified={review.is_verified}
                  initialResponse={review.response_text}
                  initialResponseAt={review.response_at}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
