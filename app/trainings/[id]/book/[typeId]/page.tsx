'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, Clock, AlertCircle, PlusCircle } from 'lucide-react'
import { format, addDays, startOfDay } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { Dog, TrainingPass, TrainingType } from '@/types'
import DogForm from '@/components/DogForm'
import Modal from '@/components/Modal'
import AuthModal from '@/components/AuthModal'
import useUser from '@/hooks/useUser'
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
  const { user } = useUser()
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
  const [passes, setPasses] = useState<TrainingPass[]>([])
  const [selectedPassId, setSelectedPassId] = useState('')
  const [dogModalOpen, setDogModalOpen] = useState(false)
  const [notes, setNotes] = useState<string>('')
  const [authOpen, setAuthOpen] = useState(false)
  const [nowMs] = useState(() => Date.now())

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
      .catch(() => {
        setError('Błąd przy ładowaniu')
        setLoading(false)
      })
  }, [trainerSlug, typeSlug])

  useEffect(() => {
    if (!user) {
      setDogs([])
      setSelectedDogId('')
      setCanManageDogs(false)
      setDogsLoading(false)
      return
    }

    setDogsLoading(true)
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
  }, [user])

  useEffect(() => {
    if (!user) return
    fetch('/api/training-passes?mine=1')
      .then(response => response.ok ? response.json() : { passes: [] })
      .then(data => setPasses(Array.isArray(data?.passes) ? data.passes : []))
      .catch(() => setPasses([]))
  }, [user])

  // Generate full-hour slots based on date availability.
  const getAvailableSlotsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const dateSlots = trainerAvailability.filter(a => a.available_date === dateStr && a.is_active)

    if (dateSlots.length === 0) return []

    const slots: string[] = []
    const duration = trainingType?.duration_min || 60
    for (const dateSlot of dateSlots) {
      const [startHour, startMin] = dateSlot.start_time.split(':').map(Number)
      const [endHour, endMin] = dateSlot.end_time.split(':').map(Number)
      const currentTime = new Date(date)
      currentTime.setHours(startHour, startMin, 0, 0)
      const endTime = new Date(date)
      endTime.setHours(endHour, endMin, 0, 0)

      while (currentTime.getTime() + duration * 60000 <= endTime.getTime()) {
        if (currentTime.getTime() > nowMs) {
          slots.push(format(currentTime, 'HH:mm'))
        }
        currentTime.setMinutes(currentTime.getMinutes() + 30)
      }
    }

    const bookedSlots = dateSlots.flatMap(slot => slot.booked_slots ?? [])
    return [...new Set(slots)].sort().filter(slot => {
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
    if (!user) {
      setAuthOpen(true)
      return
    }

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
          pass_id: selectedPassId || null,
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
          window.location.href = '/moje-zapisy?tab=trainings'
        }, 2000)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBooking(false)
    }
  }

  const availableSlots = selectedDate ? getAvailableSlotsForDate(selectedDate) : []
  const trainingPrice = trainingType
    ? Number(trainingType.price_per_hour ?? 0) * (trainingType.duration_min || 60) / 60
    : 0
  const formattedTrainingPrice = trainingPrice > 0
    ? trainingPrice.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })
    : 'Bezpłatnie'

  const availablePasses = passes.filter(pass => {
    const product = pass.training_pass_products
    if (!product) return false
    return pass.status === 'active'
      && pass.entries_remaining > 0
      && pass.dog_id === selectedDogId
      && product?.trainer_id === trainingType?.trainer_id
      && (!product.training_type_id || product.training_type_id === trainingType?.id)
  })

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
      <div className="max-w-3xl py-12">
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
      <div className="max-w-3xl py-12">
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
    <div className="max-w-3xl py-8">
      <Link href={trainerSlug ? `/trainings/${trainerSlug}` : '/trainings'} className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" />
        Wróć do profilu trenera
      </Link>

      <div className="card p-8">
        <h1 className="font-heading font-bold text-3xl mb-2">{trainingType?.name}</h1>
        {trainingType?.description && (
          <p className="text-muted-foreground mb-6">{trainingType.description}</p>
        )}

        <div className="mb-6 flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
          <span className="text-orange-800">Cena za {trainingType?.duration_min || 60} minut</span>
          <strong className="text-orange-950">{formattedTrainingPrice}</strong>
        </div>

        {/* Date Selection */}
        <div className="mb-6">
          <p id="booking-date-label" className="block text-sm font-semibold mb-3">
            <Calendar className="inline w-4 h-4 mr-2" />
            Wybierz datę
          </p>
          <div role="group" aria-labelledby="booking-date-label" className="grid grid-cols-7 gap-2">
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
                  aria-label={`${format(date, 'EEEE, d MMMM yyyy', { locale: pl })}${hasSlots ? '' : ' — brak wolnych godzin'}`}
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
            <p id="booking-time-label" className="block text-sm font-semibold mb-3">
              <Clock className="inline w-4 h-4 mr-2" />
              Wybierz godzinę
            </p>

            {availableSlots.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Brak dostępnych godzin</p>
                  <p className="text-sm">Trener nie ma godzin dostępności w tym dniu</p>
                </div>
              </div>
            ) : (
              <div role="group" aria-labelledby="booking-time-label" className="grid grid-cols-4 gap-2">
                {availableSlots.map(slot => (
                  <button
                    key={slot}
                    type="button"
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
          <p id="booking-dog-label" className="block text-sm font-semibold mb-3">Pies (opcjonalnie)</p>
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
                onValueChange={value => { setSelectedDogId(value ?? ''); setSelectedPassId('') }}
              >
                <SelectTrigger aria-labelledby="booking-dog-label" className="form-input h-12 w-full rounded-2xl px-4 py-0">
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

        {availablePasses.length > 0 && (
          <div className="mb-6">
            <label htmlFor="booking-pass" className="block text-sm font-semibold mb-3">Sposób rozliczenia</label>
            <select id="booking-pass" className="form-input" value={selectedPassId} onChange={event => setSelectedPassId(event.target.value)}>
              <option value="">Płatność online — {formattedTrainingPrice}</option>
              {availablePasses.map(pass => <option key={pass.id} value={pass.id}>{pass.training_pass_products?.name ?? 'Karnet'} — pozostało {pass.entries_remaining} wejść</option>)}
            </select>
          </div>
        )}

        {/* Notes */}
        <div className="mb-6">
          <label htmlFor="booking-notes" className="block text-sm font-semibold mb-3">Notatki (opcjonalnie)</label>
          <textarea
            id="booking-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Dodaj informacje dla trenera (problemy behawioralne, cele treningowe itp.)."
            className="form-input resize-none"
            rows={3}
            maxLength={2000}
          />
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
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
              <p><strong>Rozliczenie:</strong> {selectedPassId ? '1 wejście z karnetu' : formattedTrainingPrice}</p>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleBooking}
          disabled={!selectedDate || !selectedTime || booking}
          className="w-full btn btn-primary"
        >
          {booking
            ? 'Rezerwowanie…'
            : user
              ? selectedPassId
                ? 'Zarezerwuj i wykorzystaj wejście'
                : trainingPrice > 0
                  ? `Przejdź do płatności — ${formattedTrainingPrice}`
                  : 'Zarezerwuj bezpłatny trening'
              : 'Zaloguj się, aby zarezerwować'}
        </button>
      </div>

      <Modal open={dogModalOpen} onClose={() => setDogModalOpen(false)} title="Dodaj psa">
        <DogForm onSave={handleAddDog} onCancel={() => setDogModalOpen(false)} />
      </Modal>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
