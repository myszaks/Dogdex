import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const trainerId = searchParams.get('trainer_id')

    if (!trainerId) {
      return NextResponse.json({ error: 'Brakuje identyfikatora trenera' }, { status: 400 })
    }

    // Fetch trainer's date availability slots (public)
    const { data, error } = await supabase
      .from('trainer_date_availability')
      .select('*')
      .eq('trainer_id', trainerId)
      .eq('is_active', true)
      .gte('available_date', new Date().toISOString().split('T')[0])
      .order('available_date', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'Nie udało się pobrać dostępnych terminów' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    )
  }
}
