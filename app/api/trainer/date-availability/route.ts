import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { isTrainerRole } from '@/lib/roles'
import { createAuthClient } from '@/lib/supabaseServer'
import {
  isValidTrainingDate,
  isValidTrainingTimeRange,
} from '@/lib/trainingAvailability'
import { getBookingDateTimeParts } from '@/lib/trainingBooking'

export async function GET() {
  try {
    const { user, role } = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
    }

    if (!isTrainerRole(role)) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
    }

    const supabase = await createAuthClient()

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
  } catch {
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, role } = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
    }

    if (!isTrainerRole(role)) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
    }

    const body = await request.json()
    const { available_date, start_time, end_time } = body

    if (!isValidTrainingDate(available_date)) {
      return NextResponse.json(
        { error: 'Nieprawidłowa data' },
        { status: 400 }
      )
    }
    if (available_date < getBookingDateTimeParts(new Date()).date) {
      return NextResponse.json(
        { error: 'Nie można dodawać dostępności w przeszłości' },
        { status: 400 }
      )
    }

    if (!isValidTrainingTimeRange(start_time, end_time)) {
      return NextResponse.json(
        { error: 'Nieprawidłowy zakres godzin' },
        { status: 400 }
      )
    }

    const supabase = await createAuthClient()

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
      if (error.message?.includes('trainer_date_availability_conflict')) {
        return NextResponse.json(
          { error: 'Ten przedział nachodzi na istniejącą dostępność' },
          { status: 409 }
        )
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Taki przedział już istnieje' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Nie udało się zapisać dostępności' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, role } = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
    }

    if (!isTrainerRole(role)) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
    }

    const body = await request.json()
    const { id, start_time, end_time } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Brakuje wymaganych pól' },
        { status: 400 }
      )
    }

    if (!isValidTrainingTimeRange(start_time, end_time)) {
      return NextResponse.json(
        { error: 'Nieprawidłowy zakres godzin' },
        { status: 400 }
      )
    }

    const supabase = await createAuthClient()

    const { data: slot, error: fetchError } = await supabase
      .from('trainer_date_availability')
      .select('id')
      .eq('id', id)
      .eq('trainer_id', user.id)
      .single()

    if (fetchError || !slot) {
      return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('trainer_date_availability')
      .update({
        start_time,
        end_time,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('trainer_id', user.id)
      .select()
      .single()

    if (error) {
      if (error.message?.includes('trainer_date_availability_conflict')) {
        return NextResponse.json(
          { error: 'Ten przedział nachodzi na istniejącą dostępność' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'Nie udało się zaktualizować dostępności' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, role } = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
    }

    if (!isTrainerRole(role)) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
    }

    const body = await request.json()
    const { id } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Brakuje identyfikatora' }, { status: 400 })
    }

    const supabase = await createAuthClient()

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
  } catch {
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    )
  }
}
