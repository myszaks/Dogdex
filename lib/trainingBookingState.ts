import { getTrainingCancellationPolicy } from '@/lib/trainingCancellation'

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'

interface TransitionInput {
  currentStatus: BookingStatus
  nextStatus: BookingStatus
  actor: 'owner' | 'trainer'
  paymentStatus: PaymentStatus | null
  scheduledAt: string
  durationMin: number
  cancellationBufferHours?: number | null
  nowMs?: number
}

export type BookingTransitionResult =
  | { allowed: true; noop: boolean }
  | { allowed: false; message: string }

export function validateBookingTransition({
  currentStatus,
  nextStatus,
  actor,
  paymentStatus,
  scheduledAt,
  durationMin,
  cancellationBufferHours,
  nowMs = Date.now(),
}: TransitionInput): BookingTransitionResult {
  if (currentStatus === nextStatus) return { allowed: true, noop: true }

  if (currentStatus === 'cancelled' || currentStatus === 'completed') {
    return { allowed: false, message: 'Ta rezerwacja jest już zakończona' }
  }

  if (actor === 'owner' && nextStatus !== 'cancelled') {
    return { allowed: false, message: 'Użytkownik może jedynie anulować rezerwację' }
  }

  if (nextStatus === 'cancelled') {
    const policy = getTrainingCancellationPolicy({
      status: currentStatus,
      scheduledAt,
      bufferHours: cancellationBufferHours,
      nowMs,
    })
    if (actor === 'owner' && !policy.canCancel) {
      return {
        allowed: false,
        message: `Rezerwację można anulować najpóźniej ${policy.bufferHours} godz. przed treningiem`,
      }
    }
    return { allowed: true, noop: false }
  }

  if (actor !== 'trainer') {
    return { allowed: false, message: 'Brak uprawnień do tej zmiany' }
  }

  if (nextStatus === 'confirmed') {
    if (currentStatus !== 'pending') {
      return { allowed: false, message: 'Można potwierdzić tylko oczekującą rezerwację' }
    }
    if (paymentStatus && paymentStatus !== 'completed') {
      return { allowed: false, message: 'Nie można potwierdzić nieopłaconej rezerwacji' }
    }
    return { allowed: true, noop: false }
  }

  if (nextStatus === 'completed') {
    if (currentStatus !== 'confirmed') {
      return { allowed: false, message: 'Można zakończyć tylko potwierdzoną rezerwację' }
    }

    const scheduledMs = new Date(scheduledAt).getTime()
    const endMs = scheduledMs + durationMin * 60_000
    if (!Number.isFinite(endMs) || endMs > nowMs) {
      return { allowed: false, message: 'Nie można zakończyć treningu przed jego końcem' }
    }
    return { allowed: true, noop: false }
  }

  return { allowed: false, message: 'Nieprawidłowa zmiana statusu' }
}
