'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Calendar, Check, Clock, CreditCard, XCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { TrainingBooking } from '@/types'
import type { TrainingReview } from '@/types'
import TrainingReviewForm from '@/components/TrainingReviewForm'
import { fetchWithAuthRetry } from '@/lib/authFetch'
import GoogleCalendarPopupLink from '@/components/GoogleCalendarPopupLink'
import MyTrainingPasses from '@/components/MyTrainingPasses'
import MyTrainingCourses from '@/components/MyTrainingCourses'

interface MyTrainingsContentProps {
  embedded?: boolean
  paymentStatus?: string | null
  paymentBookingId?: string | null
}

function PaymentSummary({ booking }: { booking: TrainingBooking }) {
  const payment = booking.training_payments?.[0]
  if (!payment) return null

  const statusLabel = {
    pending: 'Oczekuje na płatność',
    completed: 'Opłacono',
    failed: 'Płatność nieudana',
    refunded: 'Zwrócono płatność',
  }[payment.status]

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <CreditCard className="w-4 h-4" />
      <span>
        {Number(payment.amount).toLocaleString('pl-PL', {
          style: 'currency',
          currency: payment.currency,
        })}
        {' · '}
        {statusLabel}
      </span>
    </div>
  )
}

export default function MyTrainingsContent({
  embedded = false,
  paymentStatus = null,
  paymentBookingId = null,
}: MyTrainingsContentProps) {
  const [bookings, setBookings] = useState<TrainingBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [resumingPayment, setResumingPayment] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (paymentStatus === 'success') {
      setSuccessMessage('Płatność została przyjęta. Potwierdzenie rezerwacji może potrwać chwilę.')
      setTimeout(() => setSuccessMessage(null), 5000)
      return
    }

    if (paymentStatus === 'cancelled') {
      if (!paymentBookingId) {
        setError('Płatność została anulowana.')
        setTimeout(() => setError(null), 5000)
        return
      }

      let disposed = false
      void fetch(`/api/training-bookings/${encodeURIComponent(paymentBookingId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          cancellation_reason: 'Anulowano płatność w Stripe',
        }),
      })
        .then(async response => {
          const data = await response.json().catch(() => null)
          if (!response.ok) {
            throw new Error(data?.error || 'Nie udało się zwolnić terminu')
          }
          if (disposed) return
          setBookings(current => current.map(booking =>
            booking.id === paymentBookingId
              ? { ...booking, status: 'cancelled' }
              : booking
          ))
          setError('Płatność anulowano, a termin został zwolniony.')
        })
        .catch(cancelError => {
          if (!disposed) setError((cancelError as Error).message)
        })

      return () => {
        disposed = true
      }
    }

    setSuccessMessage(null)
  }, [paymentBookingId, paymentStatus])

  useEffect(() => {
    let cancelled = false

    async function loadBookings() {
      try {
        const response = await fetchWithAuthRetry('/api/training-bookings')
        const data = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(typeof data?.error === 'string' ? data.error : 'Nie udało się pobrać rezerwacji')
        }

        if (!cancelled) {
          setBookings(Array.isArray(data) ? data : [])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError((loadError as Error).message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadBookings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (paymentStatus !== 'success' || !paymentBookingId) return

    let disposed = false
    let attempts = 0
    const interval = setInterval(() => {
      attempts += 1
      void fetchWithAuthRetry('/api/training-bookings')
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (disposed || !Array.isArray(data)) return
          setBookings(data)
          const paidBooking = data.find(booking => booking.id === paymentBookingId)
          if (
            paidBooking?.status === 'confirmed'
            || paidBooking?.training_payments?.[0]?.status === 'completed'
            || attempts >= 6
          ) {
            clearInterval(interval)
          }
        })
    }, 1500)

    return () => {
      disposed = true
      clearInterval(interval)
    }
  }, [paymentBookingId, paymentStatus])

  const handleCancel = async (bookingId: string) => {
    if (!confirm('Czy na pewno chcesz anulować tę rezerwację?')) {
      return
    }

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

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Błąd podczas anulowania')
      }

      setBookings(currentBookings =>
        currentBookings.map(booking =>
          booking.id === bookingId ? { ...booking, status: 'cancelled' } : booking
        )
      )
    } catch (cancelError) {
      alert((cancelError as Error).message)
    } finally {
      setCancelling(null)
    }
  }

  const handleResumePayment = async (bookingId: string) => {
    setResumingPayment(bookingId)
    setError(null)
    try {
      const response = await fetch(`/api/training-bookings/${bookingId}/checkout`, {
        method: 'POST',
      })
      const data = await response.json().catch(() => null)

      if (!response.ok || typeof data?.checkoutUrl !== 'string') {
        if (response.status === 410) {
          setBookings(current => current.map(booking =>
            booking.id === bookingId
              ? {
                  ...booking,
                  status: 'cancelled',
                  training_payments: booking.training_payments?.map(payment => ({
                    ...payment,
                    status: payment.status === 'pending' ? 'failed' : payment.status,
                  })),
                }
              : booking
          ))
        }
        throw new Error(data?.error || 'Nie udało się wznowić płatności')
      }

      window.location.assign(data.checkoutUrl)
    } catch (resumeError) {
      setError((resumeError as Error).message)
      setResumingPayment(null)
    }
  }

  const handleReviewChange = (bookingId: string, review: TrainingReview | null) => {
    setBookings(current => current.map(booking =>
      booking.id === bookingId
        ? { ...booking, training_reviews: review ? [review] : [] }
        : booking
    ))
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
      <div className="w-full py-12">
        {!embedded && (
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
          >
            {'<-'} Profil
          </Link>
        )}
        <div className="text-center text-slate-500">Ładowanie...</div>
      </div>
    )
  }

  const upcomingBookings = bookings.filter(booking =>
    new Date(booking.scheduled_at) > new Date() && ['pending', 'confirmed'].includes(booking.status)
  )
  const pastBookings = bookings.filter(booking =>
    new Date(booking.scheduled_at) <= new Date() || booking.status === 'cancelled'
  )

  return (
    <div className={embedded ? '' : 'w-full py-8'}>
      {!embedded && (
        <>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
          >
            {'<-'} Profil
          </Link>
          <div className="mb-8">
            <h1 className="page-title mb-2">Moje treningi</h1>
            <p className="text-muted-foreground">
              Twoje rezerwacje treningów indywidualnych
            </p>
          </div>
        </>
      )}

      <MyTrainingPasses />
      <MyTrainingCourses />

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

      {!error && bookings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 mb-4">Nie masz jeszcze żadnych rezerwacji</p>
          <Link href="/trainings" className="btn btn-primary inline-block">
            Przegladaj trenerow
          </Link>
        </div>
      ) : (
        <>
          {upcomingBookings.length > 0 && (
            <div className="mb-12">
              <h2 className="font-heading font-semibold text-xl mb-6">Nadchodzące treningi</h2>
              <div className="space-y-4">
                {upcomingBookings.map(booking => (
                  <div key={booking.id} className="card border-l-4 border-accent p-6">
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
                        {format(parseISO(booking.scheduled_at), 'HH:mm')} - {booking.duration_min} minut
                      </div>
                      <PaymentSummary booking={booking} />
                    </div>

                    {booking.notes_user && (
                      <div className="bg-slate-50 rounded p-3 mb-4 text-sm">
                        <p className="font-semibold mb-1">Twoje notatki:</p>
                        <p className="text-slate-600">{booking.notes_user}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                      <GoogleCalendarPopupLink
                        href={`/api/calendar/google/trainings/${booking.id}`}
                        label="Google Calendar"
                        className="btn btn-secondary btn-sm inline-flex items-center gap-2"
                      />
                      {booking.status === 'pending'
                        && booking.training_payments?.[0]?.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleResumePayment(booking.id)}
                          disabled={resumingPayment === booking.id || cancelling === booking.id}
                          className="btn btn-primary btn-sm inline-flex items-center gap-2"
                        >
                          <CreditCard className="w-4 h-4" />
                          {resumingPayment === booking.id ? 'Otwieranie Stripe…' : 'Wznów płatność'}
                        </button>
                      )}
                      {['pending', 'confirmed'].includes(booking.status) && booking.cancellation_allowed && (
                        <button
                          onClick={() => handleCancel(booking.id)}
                          disabled={cancelling === booking.id || resumingPayment === booking.id}
                          className="text-sm text-red-600 hover:text-red-700 font-semibold"
                        >
                          {cancelling === booking.id ? 'Anulowanie...' : 'Anuluj rezerwację'}
                        </button>
                      )}
                    </div>
                    {booking.status === 'confirmed' && !booking.cancellation_allowed && (
                      <p className="text-xs text-muted-foreground">
                        Minął termin bezpłatnego anulowania ({booking.cancellation_buffer_hours ?? 24} godz. przed treningiem).
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pastBookings.length > 0 && (
            <div>
              <h2 className="font-heading font-semibold text-xl mb-6">Historia</h2>
              <div className="space-y-4">
                {pastBookings.map(booking => (
                  <div key={booking.id} className="card p-6">
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
                    <div className="mt-2">
                      <PaymentSummary booking={booking} />
                    </div>
                    {booking.status === 'completed' && (
                      <TrainingReviewForm
                        bookingId={booking.id}
                        existing={booking.training_reviews?.[0]}
                        onChange={review => handleReviewChange(booking.id, review)}
                      />
                    )}
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
