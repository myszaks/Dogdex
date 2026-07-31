'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, X } from 'lucide-react'

interface TrainerBookingActionsProps {
  bookingId: string
  status: string
  canComplete: boolean
}

export default function TrainerBookingActions({
  bookingId,
  status,
  canComplete,
}: TrainerBookingActionsProps) {
  const router = useRouter()
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpdate = async (nextStatus: 'cancelled' | 'completed') => {
    setUpdating(true)
    setError(null)

    try {
      const cancellationReason = nextStatus === 'cancelled'
        ? prompt('Przyczyna anulowania (opcjonalnie):')
        : null

      if (nextStatus === 'cancelled' && cancellationReason === null) {
        setUpdating(false)
        return
      }

      const response = await fetch(`/api/training-bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          cancellation_reason: nextStatus === 'cancelled'
            ? cancellationReason || 'Anulowane przez trenera'
            : undefined,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Nie udało się zaktualizować rezerwacji')
      }

      router.refresh()
    } catch (updateError) {
      setError((updateError as Error).message)
    } finally {
      setUpdating(false)
    }
  }

  if (!['pending', 'confirmed'].includes(status)) {
    return null
  }

  return (
    <div className="card p-6">
      <h2 className="font-heading font-semibold text-lg mb-4">Akcje</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {canComplete && (
          <button
            type="button"
            onClick={() => handleUpdate('completed')}
            disabled={updating}
            className="btn btn-primary flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {updating ? 'Zapisywanie...' : 'Oznacz jako zakończony'}
          </button>
        )}
        <button
          type="button"
          onClick={() => handleUpdate('cancelled')}
          disabled={updating}
          className="btn btn-secondary flex items-center justify-center gap-2 text-red-600 hover:bg-red-50"
        >
          <X className="w-4 h-4" />
          {updating ? 'Zapisywanie...' : 'Anuluj rezerwację'}
        </button>
      </div>
    </div>
  )
}
