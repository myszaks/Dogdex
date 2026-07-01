'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Clock, MapPin, AlertCircle, Check, XCircle, CreditCard } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { TrainingBooking } from '@/types'

export default function MyTrainingsContent() {
  const searchParams = useSearchParams()
  const [bookings, setBookings] = useState<TrainingBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const paymentStatus = searchParams.get('payment')
  const bookingId = searchParams.get('booking_id')

  useEffect(() => {
    if (paymentStatus === 'success') {
      setSuccessMessage('✅ Płatność powiodła się! Twoja rezerwacja jest potwierdzona.')
      setTimeout(() => setSuccessMessage(null), 5000)
    } else if (paymentStatus === 'cancelled') {
      setError('❌ Anulowałeś płatność. Twoja rezerwacja pozostała, ale wymaga płatności.')
      setTimeout(() => setError(null), 5000)
    }
  }, [paymentStatus])

  useEffect(() => {
    fetch('/api/training-bookings')
      .then(r => {
        if (!r.ok) throw new Error('Błąd przy ładowaniu')
        return r.json()
      })
      .then(data => {
        setBookings(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const handleCancel = async (bookingId: string) => {
    if (!confirm('Czy na pewno chcesz anulować tę rezerwację?')) return

    setCancelling(bookingId)
    try {
      const response = await fetch(`/api/training-bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          cancellation_reason: 'Anulowanie przez użytkownika',
        }),
      })

      if (!response.ok) {
        throw new Error('Błąd przy anulacji')
      }

      // Update local state
      setBookings(bookings.map(b => 
        b.id === bookingId ? { ...b, status: 'cancelled' } : b
      ))
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setCancelling(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'pending':
        return 'bg-amber-50 border-amber-200 text-amber-800'
      case 'cancelled':
        return 'bg-red-50 border-red-200 text-red-800'
      case 'completed':
        return 'bg-slate-50 border-slate-200 text-slate-800'
      default:
        return 'bg-slate-50 border-slate-200'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Oczekuje na potwierdzenie'
      case 'confirmed':
        return 'Potwierdzone'
      case 'cancelled':
        return 'Anulowane'
      case 'completed':
        return 'Ukończone'
      default:
        return 'Nieznany status'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Check className="w-5 h-5 text-green-600" />
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-600" />
      default:
        return <AlertCircle className="w-5 h-5 text-amber-600" />
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
          ← Profil
        </Link>
        <div className="text-center text-slate-500">Ładowanie…</div>
      </div>
    )
  }

  const upcomingBookings = bookings.filter(b => 
    new Date(b.scheduled_at) > new Date() && ['pending', 'confirmed'].includes(b.status)
  )
  const pastBookings = bookings.filter(b => 
    new Date(b.scheduled_at) <= new Date() || b.status === 'cancelled'
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        ← Profil
      </Link>
      <div className="mb-8">
        <h1 className="page-title mb-2">Moje Treningi</h1>
        <p className="text-muted-foreground">
          Twoje rezerwacje treningów indywidualnych
        </p>
      </div>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
          <Check className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 mb-4">Nie masz jeszcze żadnych rezerwacji</p>
          <Link href="/trainings" className="btn btn-primary inline-block">
            Przeglądaj trenerów
          </Link>
        </div>
      ) : (
        <>
          {/* Upcoming */}
          {upcomingBookings.length > 0 && (
            <div className="mb-12">
              <h2 className="font-heading font-semibold text-xl mb-6">Nadchodzące treningi</h2>
              <div className="space-y-4">
                {upcomingBookings.map(booking => (
                  <div key={booking.id} className={`card border-l-4 border-accent p-6`}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-heading font-semibold text-lg mb-1">
                          {booking.training_types?.name}
                        </h3>
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-semibold ${getStatusColor(booking.status)}`}>
                          {getStatusIcon(booking.status)}
                          {getStatusLabel(booking.status)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {format(parseISO(booking.scheduled_at), 'd MMMM yyyy', { locale: pl })}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        {format(parseISO(booking.scheduled_at), 'HH:mm')} – {booking.duration_min} minut
                      </div>
                    </div>

                    {booking.notes_user && (
                      <div className="bg-slate-50 rounded p-3 mb-4 text-sm">
                        <p className="font-semibold mb-1">Twoje notatki:</p>
                        <p className="text-slate-600">{booking.notes_user}</p>
                      </div>
                    )}

                    {booking.status === 'pending' && (
                      <button
                        onClick={() => handleCancel(booking.id)}
                        disabled={cancelling === booking.id}
                        className="text-sm text-red-600 hover:text-red-700 font-semibold"
                      >
                        {cancelling === booking.id ? 'Anulowanie…' : 'Anuluj rezerwację'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past */}
          {pastBookings.length > 0 && (
            <div>
              <h2 className="font-heading font-semibold text-xl mb-6">Historia</h2>
              <div className="space-y-4">
                {pastBookings.map(booking => (
                  <div key={booking.id} className="card opacity-60 p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-heading font-semibold text-lg mb-1">
                          {booking.training_types?.name}
                        </h3>
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-semibold ${getStatusColor(booking.status)}`}>
                          {getStatusIcon(booking.status)}
                          {getStatusLabel(booking.status)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
                      <Calendar className="w-4 h-4" />
                      {format(parseISO(booking.scheduled_at), 'd MMMM yyyy', { locale: pl })}
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
