import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { sendTrainingBookingConfirmation, sendTrainingCancellationEmail } from '@/lib/email'
import { formatEmailDateTime } from '@/lib/emailDate'
import { isTrainerRole } from '@/lib/roles'

interface Params {
  params: Promise<{ id: string }>
}

// Get booking details
export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createAuthClient()

  const { data, error } = await supabase
    .from('training_bookings')
    .select('*, training_types(trainer_id, name, price_per_hour)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: 'Nie udało się pobrać rezerwacji' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Nie znaleziono rezerwacji' }, { status: 404 })

  return NextResponse.json(data)
}

// Update booking (accept, reject, or cancel)
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { status, cancellation_reason, notes_trainer } = body

  if (!status || !['confirmed', 'cancelled', 'completed'].includes(status as string)) {
    return NextResponse.json({ error: 'Nieprawidłowy status' }, { status: 400 })
  }

  const supabase = await createAuthClient()

  // Get booking and verify permissions
  const { data: booking } = await supabase
    .from('training_bookings')
    .select('*, training_types(trainer_id, name)')
    .eq('id', id)
    .single()

  if (!booking) {
    return NextResponse.json({ error: 'Nie znaleziono rezerwacji' }, { status: 404 })
  }

  // User must be either the booking owner or the trainer
  const isOwner = booking.user_id === user.id
  const isTrainer = booking.training_types?.trainer_id === user.id && isTrainerRole(role)

  if (!isOwner && !isTrainer) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  // Trainers can confirm/cancel; users can only request cancellation
  if (status === 'confirmed' && !isTrainer) {
    return NextResponse.json({ error: 'Tylko trener może potwierdzić rezerwację' }, { status: 403 })
  }

  // Prepare update
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'cancelled') {
    update.cancellation_reason = (cancellation_reason as string | null) || null
    update.cancellation_requested_by = isTrainer ? 'trainer' : 'user'
    update.cancellation_approved_at = new Date().toISOString()
  }

  if (notes_trainer && isTrainer) {
    update.notes_trainer = notes_trainer
  }

  const { data, error } = await supabase
    .from('training_bookings')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Nie udało się zaktualizować rezerwacji' }, { status: 500 })

  // Send emails based on status change
  if (status === 'confirmed' && isTrainer) {
    // Send confirmation email to user
    const userEmail = (await supabase.auth.admin.getUserById(booking.user_id)).data.user?.email || ''
    const trainerProfile = (await supabase.from('trainer_profiles').select('*').eq('trainer_id', user.id).single()).data

    if (userEmail && trainerProfile) {
      const formattedDate = formatEmailDateTime(booking.scheduled_at)

      await sendTrainingBookingConfirmation({
        to: userEmail,
        userName: (await supabase.auth.admin.getUserById(booking.user_id)).data.user?.user_metadata?.full_name || 'Użytkownik',
        trainerName: trainerProfile.full_name,
        trainingType: booking.training_types?.name || 'Trening',
        trainingDate: formattedDate,
        duration: booking.duration_min,
      })
    }
  }

  if (status === 'cancelled') {
    // Send cancellation emails to both user and trainer
    const formattedDate = formatEmailDateTime(booking.scheduled_at)

    // Email to user (if cancelled by trainer)
    if (isTrainer) {
      const userEmail = (await supabase.auth.admin.getUserById(booking.user_id)).data.user?.email || ''
      const trainerProfile = (await supabase.from('trainer_profiles').select('*').eq('trainer_id', user.id).single()).data

      if (userEmail && trainerProfile) {
        await sendTrainingCancellationEmail({
          to: userEmail,
          recipientName: (await supabase.auth.admin.getUserById(booking.user_id)).data.user?.user_metadata?.full_name || 'Użytkownik',
          trainingType: booking.training_types?.name || 'Trening',
          trainingDate: formattedDate,
          cancelledBy: 'trainer',
          reason: (cancellation_reason as string | null) || undefined,
        })
      }
    }

    // Email to trainer (if cancelled by user)
    if (isOwner) {
      const trainerProfile = (await supabase.from('trainer_profiles').select('*').eq('trainer_id', booking.training_types?.trainer_id).single()).data
      const trainerUser = (await supabase.auth.admin.getUserById(booking.training_types?.trainer_id)).data.user

      if (trainerProfile && trainerUser?.email) {
        await sendTrainingCancellationEmail({
          to: trainerUser.email,
          recipientName: trainerProfile.full_name,
          trainingType: booking.training_types?.name || 'Trening',
          trainingDate: formattedDate,
          cancelledBy: 'user',
          reason: (cancellation_reason as string | null) || undefined,
        })
      }
    }
  }

  return NextResponse.json(data)
}
