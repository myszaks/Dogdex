'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, X, AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { TrainingBooking } from '@/types'

export default function TrainerBookingsPage() {
  const [bookings, setBookings] = useState<TrainingBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/trainer/bookings')
      .then(r => r.json())
      .then(data => {
        setBookings(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(err => {
        setError('Błąd przy ładowaniu rezerwacji')
        setLoading(false)
      })
  }, [])

  const handleConfirm = async (bookingId: string) => {
    setUpdating(bookingId)
    try {
      const response = await fetch(`/api/training-bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      })

      if (!response.ok) throw new Error('Błąd')

      setBookings(bookings.map(b =>
        b.id === bookingId ? { ...b, status: 'confirmed' } : b
      ))
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setUpdating(null)
    }
  }

  const handleReject = async (bookingId: string) => {
    const reason = prompt('Przyczyna odrzucenia (opcjonalnie):')
    if (reason === null) return

    setUpdating(bookingId)
    try {
      const response = await fetch(`/api/training-bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          cancellation_reason: reason || 'Odrzucone przez trenera',
        }),
      })

      if (!response.ok) throw new Error('Błąd')

      setBookings(bookings.map(b =>
        b.id === bookingId ? { ...b, status: 'cancelled' } : b
      ))
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/trainer" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" />
          Wróć do panelu
        </Link>
        <div className="text-center text-slate-500">Ładowanie…</div>
      </div>
    )
  }

  const pendingBookings = bookings.filter(b => b.status === 'pending')
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed' && new Date(b.scheduled_at) > new Date())
  const historyBookings = bookings.filter(b => b.status === 'cancelled' || new Date(b.scheduled_at) <= new Date())

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/trainer" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" />
        Wróć do panelu
      </Link>

      <h1 className="font-heading font-bold text-3xl mb-6">Rezerwacje treningów</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p>Brak rezerwacji</p>
        </div>
      ) : (
        <>
          {/* Pending */}
          {pendingBookings.length > 0 && (
            <div className="mb-12">
              <h2 className="font-heading font-semibold text-xl mb-6 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                Oczekujące ({pendingBookings.length})
              </h2>

              <div className="space-y-4">
                {pendingBookings.map(booking => (
                  <div key={booking.id} className="card border-l-4 border-amber-500 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-heading font-semibold text-lg">
                          {booking.training_types?.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(parseISO(booking.scheduled_at), 'd MMMM yyyy HH:mm', { locale: pl })}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          👤 <span className="font-medium">{(booking as any).user_name || 'Użytkownik'}</span>
                          {booking.dogs && (
                            <>
                              {' • '}🐕 <span className="font-medium">{booking.dogs.name}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                        Oczekuje
                      </span>
                    </div>

                    {booking.notes_user && (
                      <div className="bg-slate-50 rounded p-3 mb-4 text-sm">
                        <p className="font-semibold mb-1">Notatki użytkownika:</p>
                        <p className="text-slate-600">{booking.notes_user}</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleConfirm(booking.id)}
                        disabled={updating === booking.id}
                        className="flex-1 btn btn-primary flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        Potwierdź
                      </button>
                      <button
                        onClick={() => handleReject(booking.id)}
                        disabled={updating === booking.id}
                        className="flex-1 btn btn-secondary flex items-center justify-center gap-2 text-red-600 hover:bg-red-50"
                      >
                        <X className="w-4 h-4" />
                        Odrzuć
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirmed */}
          {confirmedBookings.length > 0 && (
            <div className="mb-12">
              <h2 className="font-heading font-semibold text-xl mb-6 flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                Potwierdzone ({confirmedBookings.length})
              </h2>

              <div className="space-y-4">
                {confirmedBookings.map(booking => (
                  <div key={booking.id} className="card p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-heading font-semibold text-lg">
                          {booking.training_types?.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(parseISO(booking.scheduled_at), 'd MMMM yyyy HH:mm', { locale: pl })}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          👤 <span className="font-medium">{(booking as any).user_name || 'Użytkownik'}</span>
                          {booking.dogs && (
                            <>
                              {' • '}🐕 <span className="font-medium">{booking.dogs.name}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
                        Potwierdzone
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          {historyBookings.length > 0 && (
            <div>
              <h2 className="font-heading font-semibold text-xl mb-6">Historia</h2>

              <div className="space-y-4">
                {historyBookings.map(booking => (
                  <div key={booking.id} className="card opacity-60 p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-heading font-semibold text-lg">
                          {booking.training_types?.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(booking.scheduled_at), 'd MMMM yyyy', { locale: pl })}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        booking.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {booking.status === 'cancelled' ? 'Anulowane' : 'Ukończone'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
