import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBookingDateTimeParts } from '@/lib/trainingBooking'

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

    const today = getBookingDateTimeParts(new Date()).date

    const { data: activeTrainer, error: trainerError } = await supabase
      .from('trainer_profiles')
      .select('trainer_id')
      .eq('trainer_id', trainerId)
      .eq('is_active', true)
      .maybeSingle()

    if (trainerError) {
      return NextResponse.json({ error: 'Nie udało się sprawdzić profilu trenera' }, { status: 500 })
    }
    if (!activeTrainer) {
      return NextResponse.json({ error: 'Trener nie przyjmuje obecnie rezerwacji' }, { status: 404 })
    }

    // Fetch trainer's date availability slots (public)
    const { data, error } = await supabase
      .from('trainer_date_availability')
      .select('*')
      .eq('trainer_id', trainerId)
      .eq('is_active', true)
      .gte('available_date', today)
      .order('available_date', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'Nie udało się pobrać dostępnych terminów' }, { status: 500 })
    }

    const { data: trainerTypes, error: typesError } = await supabase
      .from('training_types')
      .select('id')
      .eq('trainer_id', trainerId)
      .eq('is_active', true)

    if (typesError) {
      return NextResponse.json({ error: 'Nie udało się pobrać ofert trenera' }, { status: 500 })
    }

    const typeIds = (trainerTypes ?? []).map(type => type.id)
    const { data: bookings, error: bookingsError } = typeIds.length > 0
      ? await supabase
          .from('training_bookings')
          .select('scheduled_at, duration_min')
          .in('training_type_id', typeIds)
          .in('status', ['pending', 'confirmed'])
      : { data: [], error: null }

    if (bookingsError) {
      return NextResponse.json({ error: 'Nie udało się pobrać zajętych terminów' }, { status: 500 })
    }

    const bookedByDate = new Map<string, Array<{ time: string; duration_min: number }>>()
    for (const booking of bookings ?? []) {
      const { date, time } = getBookingDateTimeParts(new Date(booking.scheduled_at))
      const values = bookedByDate.get(date) ?? []
      values.push({
        time,
        duration_min: booking.duration_min,
      })
      bookedByDate.set(date, values)
    }

    return NextResponse.json((data || []).map(slot => ({
      ...slot,
      booked_slots: bookedByDate.get(slot.available_date) ?? [],
    })))
  } catch {
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    )
  }
}
