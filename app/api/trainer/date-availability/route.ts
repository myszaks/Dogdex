import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { user } = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
    }

    // Fetch trainer's date availability slots
    const { data, error } = await supabase
      .from('trainer_date_availability')
      .select('*')
      .eq('trainer_id', user.id)
      .eq('is_active', true)
      .order('available_date', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'Nie udało się pobrać dostępności' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
    }

    const body = await request.json()
    const { available_date, start_time, end_time } = body

    if (!available_date || !start_time || !end_time) {
      return NextResponse.json(
        { error: 'Brakuje wymaganych pól' },
        { status: 400 }
      )
    }

    // Validate times
    if (start_time >= end_time) {
      return NextResponse.json(
        { error: 'Czas zakończenia musi być po czasie rozpoczęcia' },
        { status: 400 }
      )
    }

    // Insert new availability slot
    const { data, error } = await supabase
      .from('trainer_date_availability')
      .insert([{
        trainer_id: user.id,
        available_date,
        start_time,
        end_time,
        is_active: true,
      }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ta data jest już zajęta' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'Nie udało się zapisać dostępności' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
    }

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Brakuje identyfikatora' }, { status: 400 })
    }

    // Verify the slot belongs to the trainer
    const { data: slot, error: fetchError } = await supabase
      .from('trainer_date_availability')
      .select('id')
      .eq('id', id)
      .eq('trainer_id', user.id)
      .single()

    if (fetchError || !slot) {
      return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
    }

    // Delete the slot
    const { error } = await supabase
      .from('trainer_date_availability')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: 'Nie udało się usunąć dostępności' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    )
  }
}
