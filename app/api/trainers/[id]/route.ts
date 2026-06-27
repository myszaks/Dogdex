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

  // Get their training types with availability
  const { data: trainingTypes } = await supabase
    .from('training_types')
    .select('*, training_availability(*)')
    .eq('trainer_id', trainer.trainer_id)
    .eq('is_active', true)

  return NextResponse.json({
    ...trainer,
    training_types: trainingTypes,
  })
}
