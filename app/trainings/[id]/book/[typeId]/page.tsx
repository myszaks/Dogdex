'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, Clock, AlertCircle, PlusCircle } from 'lucide-react'
import { format, addDays, startOfDay } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { Dog, TrainingType } from '@/types'
import DogForm from '@/components/DogForm'
import Modal from '@/components/Modal'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DateAvailabilitySlot {
  id: string
  trainer_id: string
  available_date: string
  start_time: string
  end_time: string
  is_active: boolean
  booked_slots?: Array<{ time: string; duration_min: number }>
}

interface Props {
  params: Promise<{ id: string; typeId: string }>
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
  return hours * 60 + minutes
}

export default function BookTrainingPage({ params }: Props) {
  const [trainerSlug, setTrainerSlug] = useState<string | null>(null)
  const [typeSlug, setTypeSlug] = useState<string | null>(null)
  const [trainingType, setTrainingType] = useState<TrainingType | null>(null)
  const [trainerAvailability, setTrainerAvailability] = useState<DateAvailabilitySlot[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [dogs, setDogs] = useState<Dog[]>([])
  const [dogsLoading, setDogsLoading] = useState(true)
  const [canManageDogs, setCanManageDogs] = useState(true)
  const [selectedDogId, setSelectedDogId] = useState<string>('')
  const [dogModalOpen, setDogModalOpen] = useState(false)
  const [notes, setNotes] = useState<string>('')

  useEffect(() => {
    params.then(p => {
      setTrainerSlug(p.id)
      setTypeSlug(p.typeId)
    })
  }, [params])

  useEffect(() => {
    if (!trainerSlug || !typeSlug) return

    fetch(`/api/training-types/${typeSlug}?trainer=${encodeURIComponent(trainerSlug)}`)
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
  }, [trainerSlug, typeSlug])

  useEffect(() => {
    fetch('/api/dogs')
      .then(async response => {
        if (response.status === 401) {
          setCanManageDogs(false)
          return []
        }
        if (!response.ok) throw new Error('Nie udało się pobrać psów')
        setCanManageDogs(true)
        return response.json()
      })
      .then(data => {
        const nextDogs = Array.isArray(data) ? data : []
        setDogs(nextDogs)
        setSelectedDogId(current => current || nextDogs[0]?.id || '')
      })
      .catch(() => {
        setDogs([])
      })
      .finally(() => setDogsLoading(false))
  }, [])

  // Generate full-hour slots based on date availability.
  const getAvailableSlotsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const dateSlot = trainerAvailability.find(a => a.available_date === dateStr && a.is_active)

    if (!dateSlot) return []

    const slots: string[] = []
    const [startHour, startMin] = dateSlot.start_time.split(':').map(Number)
    const [endHour, endMin] = dateSlot.end_time.split(':').map(Number)

    const currentTime = new Date(date)
    currentTime.setHours(startHour, 0, 0, 0)
    if (startMin > 0) {
      currentTime.setHours(currentTime.getHours() + 1)
    }

    const endTime = new Date(date)
    endTime.setHours(endHour, endMin, 0, 0)

    const duration = trainingType?.duration_min || 60

    while (currentTime.getTime() + duration * 60000 <= endTime.getTime()) {
      slots.push(format(currentTime, 'HH:mm'))
      currentTime.setHours(currentTime.getHours() + 1)
    }

    const bookedSlots = dateSlot.booked_slots ?? []
    return slots.filter(slot => {
      const slotStart = timeToMinutes(slot)
      const slotEnd = slotStart + duration

      return !bookedSlots.some(booked => {
        const bookedStart = timeToMinutes(booked.time)
        const bookedEnd = bookedStart + booked.duration_min
        return slotStart < bookedEnd && slotEnd > bookedStart
      })
    })
  }

  const handleSelectDate = (date: Date) => {
    const slots = getAvailableSlotsForDate(date)
    if (slots.length === 0) return
    setSelectedDate(date)
    setSelectedTime(null)
  }

  const handleBooking = async () => {
    if (!selectedDate || !selectedTime || !trainingType) {
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
          training_type_id: trainingType.id,
          training_type_slug: trainingType.slug,
          dog_id: selectedDogId || null,
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

  const availableSlots = selectedDate ? getAvailableSlotsForDate(selectedDate) : []

  const handleAddDog = async (data: Partial<Dog>) => {
    const response = await fetch('/api/dogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error ?? 'Błąd zapisu psa')

    setDogs(prev => [...prev, json])
    setSelectedDogId(json.id)
    setDogModalOpen(false)
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link href={trainerSlug ? `/trainings/${trainerSlug}` : '/trainings'} className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
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
        <Link href={trainerSlug ? `/trainings/${trainerSlug}` : '/trainings'} className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
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
      <Link href={trainerSlug ? `/trainings/${trainerSlug}` : '/trainings'} className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
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
              const dateSlots = getAvailableSlotsForDate(date)
              const hasSlots = dateSlots.length > 0
              const dayStr = format(date, 'd', { locale: pl })
              const dateStr = format(date, 'EEE', { locale: pl })

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectDate(date)}
                  disabled={!hasSlots}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/10 text-accent font-semibold'
                      : hasSlots
                        ? 'border-border hover:border-accent/50'
                        : 'border-border bg-secondary/50 text-muted-foreground/40 cursor-not-allowed'
                  }`}
                  title={hasSlots ? undefined : 'Brak dostępnych godzin w tym dniu'}
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
          {dogsLoading ? (
            <div className="form-input text-muted-foreground">Ładowanie psów...</div>
          ) : !canManageDogs ? (
            <div className="rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
              Zaloguj się, żeby wybrać psa z profilu.
            </div>
          ) : dogs.length > 0 ? (
            <div className="space-y-2">
              <Select
                value={selectedDogId}
                onValueChange={value => setSelectedDogId(value ?? '')}
              >
                <SelectTrigger className="form-input h-12 w-full rounded-2xl px-4 py-0">
                  <SelectValue placeholder="Wybierz psa">
                    {value => {
                      if (!value) return 'Bez przypisanego psa'
                      const dog = dogs.find(item => item.id === value)
                      return dog ? `${dog.name}${dog.breed ? ` (${dog.breed})` : ''}` : 'Wybierz psa'
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  alignItemWithTrigger={false}
                  className="z-[120] w-[var(--anchor-width)] min-w-[var(--anchor-width)] rounded-2xl p-1"
                >
                  <SelectItem value="" className="rounded-xl px-3 py-2.5 focus:bg-secondary focus:text-foreground">
                    Bez przypisanego psa
                  </SelectItem>
                  {dogs.map(dog => (
                    <SelectItem
                      key={dog.id}
                      value={dog.id}
                      className="rounded-xl px-3 py-2.5 focus:bg-secondary focus:text-foreground"
                    >
                      {dog.name}{dog.breed ? ` (${dog.breed})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setDogModalOpen(true)}
                className="text-sm text-accent hover:underline"
              >
                Dodaj kolejnego psa
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-secondary/60 px-4 py-4">
              <p className="text-sm font-semibold text-foreground">Nie masz jeszcze dodanego psa.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Dodaj profil psa, żeby łatwiej powiązać rezerwację z jego danymi.
              </p>
              <button
                type="button"
                onClick={() => setDogModalOpen(true)}
                className="btn btn-secondary btn-sm mt-3"
              >
                <PlusCircle className="w-4 h-4" />
                Dodaj psa
              </button>
            </div>
          )}
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

      <Modal open={dogModalOpen} onClose={() => setDogModalOpen(false)} title="Dodaj psa">
        <DogForm onSave={handleAddDog} onCancel={() => setDogModalOpen(false)} />
      </Modal>
    </div>
  )
}
