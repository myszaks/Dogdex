import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const typeId = url.searchParams.get('type_id')

  if (!typeId) {
    return NextResponse.json({ error: 'Brakuje type_id' }, { status: 400 })
  }

  const supabase = await createAuthClient()

  const { data, error } = await supabase
    .from('training_availability')
    .select('*')
    .eq('training_type_id', typeId)
    .order('day_of_week, start_time')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
