import { NextRequest, NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { toSlug } from '@/lib/utils'
import type { SupabaseClient } from '@supabase/supabase-js'

async function generateDogSlug(supabase: SupabaseClient, userId: string, name: string): Promise<string> {
  const base = toSlug(name)
  let slug = base
  let i = 1
  while (true) {
    const { data } = await supabase.from('dogs').select('id').eq('user_id', userId).eq('slug', slug).maybeSingle()
    if (!data) return slug
    slug = `${base}-${i++}`
  }
}

// GET /api/dogs — lista psów zalogowanego użytkownika
export async function GET() {
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const { data, error } = await supabase
    .from('dogs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/dogs — dodaj psa
export async function POST(req: NextRequest) {
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const body = await req.json()
  const { name, breed, gender, pedigree_or_chip, coat_color, weight_kg, height_cm, agility_level, photo_url, rabies_vaccine_expiry } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Imię psa jest wymagane' }, { status: 400 })

  const slug = await generateDogSlug(supabase, user.id, name.trim())

  const { data, error } = await supabase
    .from('dogs')
    .insert({
      user_id: user.id,
      slug,
      name: name.trim(),
      breed: breed?.trim() || null,
      gender: gender || null,
      pedigree_or_chip: pedigree_or_chip?.trim() || null,
      coat_color: coat_color?.trim() || null,
      weight_kg: weight_kg ? Number(weight_kg) : null,
      height_cm: height_cm ? Number(height_cm) : null,
      agility_level: agility_level || null,
      photo_url: photo_url || null,
      rabies_vaccine_expiry: rabies_vaccine_expiry || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
