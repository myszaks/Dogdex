import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'

export async function GET() {
  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('training_types')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Nie udało się pobrać typów treningów' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  // Only organizers and admins can create training types
  if (role !== 'organizer' && role !== 'admin') {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { name, description, price_per_hour, duration_min, is_active } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Nazwa typu treningu jest wymagana' }, { status: 400 })
  }

  const supabase = await createAuthClient()

  const { data, error } = await supabase
    .from('training_types')
    .insert([{
      trainer_id: user.id,
      name: (name as string).trim(),
      description: (description as string | null) || null,
      price_per_hour: typeof price_per_hour === 'number' ? price_per_hour : null,
      duration_min: typeof duration_min === 'number' ? duration_min : 60,
      is_active: typeof is_active === 'boolean' ? is_active : true,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Nie udało się utworzyć typu treningu' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
