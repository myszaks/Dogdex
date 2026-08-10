import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createAuthClient()

  // Get trainer profile with all their training types
  const { data: trainerBySlug, error: slugError } = await supabase
    .from('trainer_profiles')
    .select('*')
    .eq('slug', id)
    .maybeSingle()

  let trainer = trainerBySlug

  if (!trainer && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    const { data: trainerById } = await supabase
      .from('trainer_profiles')
      .select('*')
      .eq('trainer_id', id)
      .maybeSingle()
    trainer = trainerById
  }

  if (slugError || !trainer) {
    return NextResponse.json({ error: 'Nie znaleziono trenera' }, { status: 404 })
  }

  const [{ data: trainingTypes, error: typesError }, { data: reviews, error: reviewsError }, { data: courses }, { data: passProducts }] =
    await Promise.all([
      supabase
        .from('training_types')
        .select('*')
        .eq('trainer_id', trainer.trainer_id)
        .eq('is_active', true),
      supabase
        .from('training_reviews')
        .select('id, booking_id, trainer_id, user_id, author_name, rating, comment, is_verified, moderation_status, response_text, response_at, created_at, updated_at')
        .eq('trainer_id', trainer.trainer_id)
        .eq('moderation_status', 'published')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('training_courses')
        .select('*, training_course_sessions(*)')
        .eq('trainer_id', trainer.trainer_id)
        .eq('status', 'published')
        .order('created_at', { ascending: false }),
      supabase
        .from('training_pass_products')
        .select('*')
        .eq('trainer_id', trainer.trainer_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ])

  if (typesError || reviewsError) {
    return NextResponse.json({ error: 'Nie udało się pobrać profilu trenera' }, { status: 500 })
  }
  const ratings = (reviews ?? []).map(review => Number(review.rating))

  return NextResponse.json({
    ...trainer,
    training_types: trainingTypes,
    training_courses: courses ?? [],
    training_pass_products: passProducts ?? [],
    reviews: reviews ?? [],
    rating: ratings.length > 0
      ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
      : null,
    review_count: ratings.length,
  })
}
