import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser, canManageTrainerResource } from '@/lib/getServerUser'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createAuthClient()

  const { data, error } = await supabase
    .from('training_types')
    .select('*, training_availability(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: Params) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Nie autoryzowany' }, { status: 401 })

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
