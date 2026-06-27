import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser, canManageTrainerResource } from '@/lib/getServerUser'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const trainerSlug = searchParams.get('trainer')
  const supabase = await createAuthClient()

  let query = supabase
    .from('training_types')
    .select('*, training_availability(*)')

  if (trainerSlug) {
    const { data: trainer } = await supabase
      .from('trainer_profiles')
      .select('trainer_id')
      .eq('slug', trainerSlug)
      .maybeSingle()

    if (!trainer) return NextResponse.json({ error: 'Nie znaleziono trenera' }, { status: 404 })

    query = query.eq('trainer_id', trainer.trainer_id).eq('slug', id)
  } else {
    query = query.eq('id', id)
  }

  const { data, error } = await query.maybeSingle()

  if (error) return NextResponse.json({ error: 'Nie udało się pobrać typu treningu' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: Params) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const { id } = await params
  const supabase = await createAuthClient()

  // Verify ownership or admin
  const { data: type } = await supabase
    .from('training_types')
    .select('trainer_id')
    .eq('id', id)
    .single()

  if (!type || !canManageTrainerResource(user.id, type.trainer_id, role)) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const { error } = await supabase
    .from('training_types')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Nie udało się usunąć typu treningu' }, { status: 500 })
  return NextResponse.json({ success: true })
}
