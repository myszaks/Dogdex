import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createAuthClient()

  // Get trainer profile with all their training types
  const { data: trainer, error } = await supabase
    .from('trainer_profiles')
    .select('*')
    .eq('trainer_id', id)
    .single()

  if (error || !trainer) {
    return NextResponse.json({ error: 'Nie znaleziono trenera' }, { status: 404 })
  }

  // Get their training types with availability
  const { data: trainingTypes } = await supabase
    .from('training_types')
    .select('*, training_availability(*)')
    .eq('trainer_id', id)
    .eq('is_active', true)

  return NextResponse.json({
    ...trainer,
    training_types: trainingTypes,
  })
}
