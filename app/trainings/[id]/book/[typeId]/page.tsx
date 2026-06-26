'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, Clock, AlertCircle } from 'lucide-react'
import { format, addDays, startOfDay } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { TrainingType } from '@/types'

interface DateAvailabilitySlot {
  id: string
  trainer_id: string
  available_date: string
  start_time: string
  end_time: string
  is_active: boolean
}

interface Props {
  params: Promise<{ id: string; typeId: string }>
}

export default function BookTrainingPage({ params }: Props) {
  const [trainerId, setTrainerId] = useState<string | null>(null)
  const [typeId, setTypeId] = useState<string | null>(null)
  const [trainingType, setTrainingType] = useState<TrainingType | null>(null)
  const [trainerAvailability, setTrainerAvailability] = useState<DateAvailabilitySlot[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [dogId, setDogId] = useState<string>('')
  const [notes, setNotes] = useState<string>('')

  useEffect(() => {
    params.then(p => {
      setTrainerId(p.id)
      setTypeId(p.typeId)
    })
  }, [params])

  useEffect(() => {
    if (!typeId) return

    fetch(`/api/training-types/${typeId}`)
      .then(r => r.json())
      .then(data => {
        setTrainingType(data)
        return fetch(`/api/trainer/date-availability/public?trainer_id=${data.trainer_id}`)
      })
      .then(r => r.json())
      .then(data => {
        setTrainerAvailability(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(err => {
        setError('Błąd przy ładowaniu')
        setLoading(false)
      })
  }, [typeId])

  // Generate available time slots based on date availability
  const getAvailableSlots = () => {
    if (!selectedDate) return []

    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const dateSlot = trainerAvailability.find(a => a.available_date === dateStr && a.is_active)

    if (!dateSlot) return []

    const slots: string[] = []
    const [startHour, startMin] = dateSlot.start_time.split(':').map(Number)
    const [endHour, endMin] = dateSlot.end_time.split(':').map(Number)

    let currentTime = new Date(selectedDate)
    currentTime.setHours(startHour, startMin, 0, 0)

    const endTime = new Date(selectedDate)
    endTime.setHours(endHour, endMin, 0, 0)

    const duration = trainingType?.duration_min || 60

    while (currentTime.getTime() + duration * 60000 <= endTime.getTime()) {
      slots.push(format(currentTime, 'HH:mm'))
      currentTime.setMinutes(currentTime.getMinutes() + 30)
    }

    return slots
  }

  const handleBooking = async () => {
    if (!selectedDate || !selectedTime || !typeId) {
      setError('Wybierz datę i godzinę')
      return
    }

    setBooking(true)
    setError(null)

    try {
      const [hours, minutes] = selectedTime.split(':').map(Number)
      const scheduledAt = new Date(selectedDate)
      scheduledAt.setHours(hours, minutes, 0, 0)

      const response = await fetch('/api/training-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          training_type_id: typeId,
          dog_id: dogId || null,
          scheduled_at: scheduledAt.toISOString(),
          duration_min: trainingType?.duration_min || 60,
          notes_user: notes || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Błąd przy rezerwacji')
      }

      const data = await response.json()

      // If trainer has Stripe account, redirect to checkout
      if (data.checkoutUrl) {
        // Redirect to Stripe Checkout
        window.location.href = data.checkoutUrl
      } else {
        // No payment needed, go to my trainings
        setSuccess(true)
        setTimeout(() => {
          window.location.href = `/moje-treningi`
        }, 2000)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBooking(false)
    }
  }

  const availableSlots = getAvailableSlots()

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link href={trainerId ? `/trainings/${trainerId}` : '/trainings'} className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" />
          Wróć
        </Link>
        <div className="text-center text-slate-500">Ładowanie…</div>
      </div>
    )
  }

  if (error && !trainingType) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link href={`/trainings/${trainerId}`} className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" />
          Wróć
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/trainings/${trainerId}`} className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" />
        Wróć do profilu trenera
      </Link>

      <div className="card p-8">
        <h1 className="font-heading font-bold text-3xl mb-2">{trainingType?.name}</h1>
        {trainingType?.description && (
          <p className="text-muted-foreground mb-6">{trainingType.description}</p>
        )}

        {/* Date Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-3">
            <Calendar className="inline w-4 h-4 mr-2" />
            Wybierz datę
          </label>
          <div className="grid grid-cols-7 gap-2">
            {[...Array(14)].map((_, i) => {
              const date = addDays(startOfDay(new Date()), i)
              const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
              const dayStr = format(date, 'd', { locale: pl })
              const dateStr = format(date, 'EEE', { locale: pl })

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(date)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/10 text-accent font-semibold'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <div className="text-xs">{dateStr}</div>
                  <div className="font-semibold text-sm">{dayStr}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Time Selection */}
        {selectedDate && (
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-3">
              <Clock className="inline w-4 h-4 mr-2" />
              Wybierz godzinę
            </label>

            {availableSlots.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Brak dostępnych godzin</p>
                  <p className="text-sm">Trener nie ma godzin dostępności w tym dniu</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {availableSlots.map(slot => (
                  <button
                    key={slot}
                    onClick={() => setSelectedTime(slot)}
                    className={`p-3 rounded-lg border-2 transition-all font-semibold ${
                      selectedTime === slot
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border hover:border-accent/50'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dog Selection (Optional) */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-3">Pies (opcjonalnie)</label>
          <input
            type="text"
            value={dogId}
            onChange={e => setDogId(e.target.value)}
            placeholder="ID psa z Twoich psów"
            className="form-input"
          />
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-3">Notatki (opcjonalnie)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Dodaj informacje dla trenera (problemy behawioralne, cele treningowe itp)"
            className="form-input resize-none"
            rows={3}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            Rezerwacja utworzona! Przekierowywanie…
          </div>
        )}

        {/* Summary */}
        {selectedDate && selectedTime && (
          <div className="bg-slate-50 rounded-lg p-4 mb-6 border border-slate-200">
            <p className="text-sm text-muted-foreground mb-2">Podsumowanie rezerwacji:</p>
            <div className="space-y-1 text-sm">
              <p><strong>Typ treningu:</strong> {trainingType?.name}</p>
              <p><strong>Data:</strong> {format(selectedDate, 'd MMMM yyyy', { locale: pl })}</p>
              <p><strong>Godzina:</strong> {selectedTime}</p>
              <p><strong>Czas trwania:</strong> {trainingType?.duration_min || 60} minut</p>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleBooking}
          disabled={!selectedDate || !selectedTime || booking}
          className="w-full btn btn-primary"
        >
          {booking ? 'Rezerwowanie…' : 'Zarezerwuj trening'}
        </button>
      </div>
    </div>
  )
}
