'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { pl } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DateAvailabilitySlot {
  id: string
  available_date: string
  start_time: string
  end_time: string
  is_active: boolean
}

const WEEKDAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd']

function normalizeTime(value: string) {
  return value.slice(0, 5)
}

function toDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

export default function DateAvailabilityManager() {
  const [slots, setSlots] = useState<DateAvailabilitySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('18:00')

  const slotsByDate = useMemo(() => {
    const map = new Map<string, DateAvailabilitySlot[]>()
    for (const slot of slots) {
      if (!slot.is_active) continue
      const dateSlots = map.get(slot.available_date) ?? []
      dateSlots.push(slot)
      map.set(
        slot.available_date,
        dateSlots.sort((left, right) => left.start_time.localeCompare(right.start_time))
      )
    }
    return map
  }, [slots])

  const selectedKey = toDateKey(selectedDate)
  const selectedSlots = slotsByDate.get(selectedKey) ?? []
  const editingSlot = selectedSlots.find(slot => slot.id === editingSlotId) ?? null
  const todayKey = toDateKey(new Date())

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentMonth])

  const loadSlots = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/trainer/date-availability')
      if (!response.ok) throw new Error('Błąd ładowania')
      const data = await response.json()
      setSlots(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSlots()
  }, [])

  useEffect(() => {
    const slot = editingSlot
    if (slot) {
      setStartTime(normalizeTime(slot.start_time))
      setEndTime(normalizeTime(slot.end_time))
    } else {
      setStartTime('10:00')
      setEndTime('18:00')
    }
  }, [editingSlot, selectedKey])

  function showSuccess(message: string) {
    setSuccess(message)
    setTimeout(() => setSuccess(null), 3000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (selectedKey < todayKey) {
      setError('Nie możesz ustawiać dostępności w przeszłości')
      return
    }

    if (startTime >= endTime) {
      setError('Czas zakończenia musi być po czasie rozpoczęcia')
      return
    }

    try {
      setSubmitting(true)
      const response = await fetch('/api/trainer/date-availability', {
        method: editingSlot ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSlot?.id,
          available_date: selectedKey,
          start_time: startTime,
          end_time: endTime,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Nie udało się zapisać dostępności')

      setSlots(prev => {
        if (editingSlot) {
          return prev.map(slot => slot.id === editingSlot.id ? data : slot)
        }
        return [...prev, data]
      })
      showSuccess(editingSlot ? 'Dostępność zaktualizowana' : 'Dostępność dodana')
      setEditingSlotId(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(slotToDelete: DateAvailabilitySlot) {
    if (!confirm('Usunąć dostępność dla wybranego dnia?')) return

    try {
      setDeleting(true)
      setError(null)
      const response = await fetch('/api/trainer/date-availability', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slotToDelete.id }),
      })

      if (!response.ok) throw new Error('Nie udało się usunąć dostępności')

      setSlots(prev => prev.filter(slot => slot.id !== slotToDelete.id))
      if (editingSlotId === slotToDelete.id) setEditingSlotId(null)
      showSuccess('Dostępność usunięta')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="text-center py-10 text-muted-foreground">Ładowanie dostępności...</div>
  }

  const upcomingSlots = [...slots]
    .filter(slot => slot.available_date >= todayKey)
    .sort((a, b) => `${a.available_date} ${a.start_time}`.localeCompare(`${b.available_date} ${b.start_time}`))

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="bg-card border border-border rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-5">
          <button
            type="button"
            onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Poprzedni miesiąc"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="font-heading font-bold text-2xl">
              {format(currentMonth, 'LLLL yyyy', { locale: pl })}
            </p>
            <p className="text-xs text-muted-foreground">Kliknij dzień, żeby dodać albo edytować godziny</p>
          </div>
          <button
            type="button"
            onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Następny miesiąc"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEKDAYS.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-1">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map(day => {
            const key = toDateKey(day)
            const dateSlots = slotsByDate.get(key) ?? []
            const past = key < todayKey
            const selected = isSameDay(day, selectedDate)
            const inMonth = isSameMonth(day, currentMonth)

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelectedDate(day)
                  setEditingSlotId(null)
                  if (!inMonth) setCurrentMonth(startOfMonth(day))
                }}
                disabled={past}
                className={cn(
                  'min-h-20 rounded-2xl border p-2 text-left transition-all',
                  'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
                  !inMonth && 'opacity-45',
                  past && 'cursor-not-allowed bg-secondary/40 text-muted-foreground/40',
                  selected && 'border-accent bg-accent/10 shadow-sm',
                  !selected && !past && 'border-border hover:border-accent/60 hover:bg-secondary/60',
                  dateSlots.length > 0 && !selected && 'bg-orange-50 border-orange-200'
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={cn('text-sm font-bold', isToday(day) && 'text-accent')}>
                    {format(day, 'd')}
                  </span>
                  {dateSlots.length > 0 && <span className="w-2 h-2 rounded-full bg-accent mt-1" />}
                </div>
                {dateSlots.length > 0 && (
                  <div className="mt-3 text-[11px] leading-tight text-foreground font-semibold">
                    {normalizeTime(dateSlots[0].start_time)}-{normalizeTime(dateSlots[0].end_time)}
                    {dateSlots.length > 1 && <span className="block text-accent">+{dateSlots.length - 1}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <aside className="space-y-5">
        {selectedSlots.length > 0 && (
          <section className="bg-card border border-border rounded-2xl shadow-sm p-5">
            <h2 className="font-heading font-bold text-lg mb-3">Przedziały tego dnia</h2>
            <div className="space-y-2">
              {selectedSlots.map(slot => (
                <div
                  key={slot.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3',
                    editingSlotId === slot.id ? 'border-accent bg-accent/10' : 'border-border'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setEditingSlotId(slot.id)}
                    className="flex-1 text-left text-sm font-semibold"
                  >
                    {normalizeTime(slot.start_time)} - {normalizeTime(slot.end_time)}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(slot)}
                    disabled={deleting}
                    className="p-2 rounded-xl text-red-600 hover:bg-red-50"
                    aria-label={`Usuń przedział ${normalizeTime(slot.start_time)}–${normalizeTime(slot.end_time)}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <form onSubmit={handleSave} className="bg-card border border-border rounded-2xl shadow-sm p-5 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {editingSlot ? 'Edytuj przedział' : 'Nowy przedział'}
              </p>
              <h2 className="font-heading font-bold text-xl">
                {format(selectedDate, 'EEEE, d MMMM', { locale: pl })}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="availability-start-time" className="space-y-2">
              <span className="block text-sm font-semibold">Od</span>
              <input
                id="availability-start-time"
                type="time"
                step={1800}
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="form-input"
                aria-describedby={error ? 'availability-error' : undefined}
              />
            </label>
            <label htmlFor="availability-end-time" className="space-y-2">
              <span className="block text-sm font-semibold">Do</span>
              <input
                id="availability-end-time"
                type="time"
                step={1800}
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="form-input"
                aria-describedby={error ? 'availability-error' : undefined}
              />
            </label>
          </div>

          <div className="rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
            Terminy rezerwacji są wyznaczane co 30 minut. Możesz dodać kilka oddzielnych przedziałów jednego dnia.
          </div>

          {error && <div id="availability-error" role="alert" className="bg-red-50 text-red-700 px-4 py-3 rounded-2xl text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-2xl text-sm">{success}</div>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary flex-1"
            >
              <Save className="w-4 h-4" />
              {submitting ? 'Zapisywanie...' : editingSlot ? 'Zapisz zmiany' : 'Dodaj przedział'}
            </button>
            {editingSlot && (
              <button
                type="button"
                onClick={() => setEditingSlotId(null)}
                className="btn btn-secondary"
              >
                Anuluj
              </button>
            )}
          </div>
        </form>

        <section className="bg-card border border-border rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-accent" />
            <h2 className="font-heading font-bold text-xl">Najbliższe terminy</h2>
          </div>

          {upcomingSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Brak ustawionej dostępności.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {upcomingSlots.map(slot => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => {
                    const date = parseISO(slot.available_date)
                    setSelectedDate(date)
                    setEditingSlotId(slot.id)
                    setCurrentMonth(startOfMonth(date))
                  }}
                  className="w-full flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 text-left hover:border-accent/60 hover:bg-secondary/60 transition-colors"
                >
                  <span>
                    <span className="block text-sm font-semibold">
                      {format(parseISO(slot.available_date), 'd MMMM, EEEE', { locale: pl })}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {normalizeTime(slot.start_time)} - {normalizeTime(slot.end_time)}
                    </span>
                  </span>
                  <span className="text-xs text-accent font-semibold">Edytuj</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}
