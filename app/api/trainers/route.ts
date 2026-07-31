import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import type { TrainerProfileWithStats, TrainingReview, TrainingType } from '@/types'

function normalized(value: string | null) {
  return (value ?? '').trim().toLocaleLowerCase('pl-PL')
}

export async function GET(req: Request) {
  const supabase = await createAuthClient()
  const [{ data: trainers, error }, { data: types, error: typesError }, { data: reviews, error: reviewsError }] =
    await Promise.all([
      supabase
        .from('trainer_profiles')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('training_types')
        .select('*')
        .eq('is_active', true),
      supabase
        .from('training_reviews')
        .select('trainer_id, rating'),
    ])

  if (error || typesError || reviewsError) {
    console.error('[trainers] Failed to load searchable trainers:', { error, typesError, reviewsError })
    return NextResponse.json({ error: 'Nie udało się pobrać trenerów' }, { status: 500 })
  }

  const typesByTrainer = new Map<string, TrainingType[]>()
  for (const type of (types ?? []) as TrainingType[]) {
    const trainerTypes = typesByTrainer.get(type.trainer_id) ?? []
    trainerTypes.push(type)
    typesByTrainer.set(type.trainer_id, trainerTypes)
  }

  const ratingsByTrainer = new Map<string, number[]>()
  for (const review of (reviews ?? []) as Pick<TrainingReview, 'trainer_id' | 'rating'>[]) {
    const ratings = ratingsByTrainer.get(review.trainer_id) ?? []
    ratings.push(review.rating)
    ratingsByTrainer.set(review.trainer_id, ratings)
  }

  const enriched = ((trainers ?? []) as TrainerProfileWithStats[]).map(trainer => {
    const trainingTypes = typesByTrainer.get(trainer.trainer_id) ?? []
    const ratings = ratingsByTrainer.get(trainer.trainer_id) ?? []
    const prices = trainingTypes
      .map(type => Number(type.price_per_hour))
      .filter(price => Number.isFinite(price) && price >= 0)
    return {
      ...trainer,
      training_types: trainingTypes,
      rating: ratings.length > 0
        ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
        : null,
      review_count: ratings.length,
      min_price: prices.length > 0 ? Math.min(...prices) : null,
    }
  })

  const params = new URL(req.url).searchParams
  const query = normalized(params.get('q'))
  const city = normalized(params.get('city'))
  const specialization = normalized(params.get('specialization'))
  const minPrice = Number(params.get('min_price'))
  const maxPrice = Number(params.get('max_price'))
  const minRating = Number(params.get('min_rating'))
  const sort = params.get('sort') ?? 'rating'

  const filtered = enriched.filter(trainer => {
    const trainerTypes = trainer.training_types ?? []
    const searchable = normalized([
      trainer.full_name,
      trainer.bio,
      trainer.location_city,
      ...trainerTypes.flatMap(type => [type.name, type.description]),
    ].filter(Boolean).join(' '))
    if (query && !searchable.includes(query)) return false
    if (city && !normalized(trainer.location_city).includes(city)) return false
    if (
      specialization
      && !trainerTypes.some(type => normalized(`${type.name} ${type.description ?? ''}`).includes(specialization))
    ) return false
    if (Number.isFinite(minPrice) && params.has('min_price') && (trainer.min_price ?? Infinity) < minPrice) return false
    if (Number.isFinite(maxPrice) && params.has('max_price') && (trainer.min_price ?? Infinity) > maxPrice) return false
    if (Number.isFinite(minRating) && params.has('min_rating') && (trainer.rating ?? 0) < minRating) return false
    return true
  })

  filtered.sort((a, b) => {
    if (sort === 'price_asc') return (a.min_price ?? Infinity) - (b.min_price ?? Infinity)
    if (sort === 'price_desc') return (b.min_price ?? -1) - (a.min_price ?? -1)
    if (sort === 'name') return a.full_name.localeCompare(b.full_name, 'pl')
    return (b.rating ?? -1) - (a.rating ?? -1) || (b.review_count ?? 0) - (a.review_count ?? 0)
  })

  return NextResponse.json(filtered)
}
