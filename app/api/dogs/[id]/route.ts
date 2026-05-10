import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'

async function getOwnDog(dogId: string, userId: string) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('dogs')
    .select('*')
    .eq('id', dogId)
    .eq('user_id', userId)
    .single()
  return data
}

// GET /api/dogs/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const dog = await getOwnDog(params.id, user.id)
  if (!dog) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  return NextResponse.json(dog)
}

// PATCH /api/dogs/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const existing = await getOwnDog(params.id, user.id)
  if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  const body = await req.json()
  const allowed = ['name', 'breed', 'gender', 'pedigree_or_chip', 'coat_color', 'weight_kg', 'height_cm', 'agility_level', 'photo_url', 'rabies_vaccine_expiry']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key] === '' ? null : body[key]
  }
  if (update.name !== undefined && !String(update.name).trim()) {
    return NextResponse.json({ error: 'Imię psa jest wymagane' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('dogs')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/dogs/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const supabase = createServerClient()
  const { error } = await supabase
    .from('dogs')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
