import { NextRequest, NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { toSlug } from '@/lib/utils'
import type { SupabaseClient } from '@supabase/supabase-js'

async function generateDogSlug(supabase: SupabaseClient, userId: string, name: string, excludeId: string): Promise<string> {
  const base = toSlug(name) || 'pies'
  let slug = base
  let i = 2
  while (true) {
    const { data } = await supabase.from('dogs').select('id').eq('user_id', userId).eq('slug', slug).neq('id', excludeId).maybeSingle()
    if (!data) return slug
    slug = `${base}-${i++}`
  }
}

// GET /api/dogs/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const { data: dog } = await supabase
    .from('dogs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!dog) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  return NextResponse.json(dog)
}

// PATCH /api/dogs/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const { data: existing } = await supabase
    .from('dogs').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  const body = await req.json()
  const allowed = ['name', 'breed', 'gender', 'pedigree_or_chip', 'coat_color', 'weight_kg', 'height_cm', 'agility_level', 'photo_url', 'rabies_vaccine_expiry', 'birth_date']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key] === '' ? null : body[key]
  }
  if (update.name !== undefined && !String(update.name).trim()) {
    return NextResponse.json({ error: 'Imię psa jest wymagane' }, { status: 400 })
  }
  // Regenerate slug when name changes
  if (update.name) {
    update.slug = await generateDogSlug(supabase, user.id, String(update.name).trim(), id)
  }

  const { data, error } = await supabase
    .from('dogs')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/dogs/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const { error } = await supabase
    .from('dogs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
