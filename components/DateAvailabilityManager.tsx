'use client'

import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { Plus, Trash2, Clock } from 'lucide-react'
import 'react-datepicker/dist/react-datepicker.css'

interface DateAvailabilitySlot {
  id: string
  available_date: string
  start_time: string
  end_time: string
  is_active: boolean
}

export default function DateAvailabilityManager() {
  const [slots, setSlots] = useState<DateAvailabilitySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('18:00')
  const [submitting, setSubmitting] = useState(false)

  // Load slots
  const loadSlots = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/trainer/date-availability')

      if (!response.ok) throw new Error('Błąd ładowania')
      const data = await response.json()
      setSlots(data)
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

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDate) {
      setError('Wybierz datę')
      return
    }

    if (startTime >= endTime) {
      setError('Czas zakończenia musi być po czasie rozpoczęcia')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const formattedDate = format(selectedDate, 'yyyy-MM-dd')
      const response = await fetch('/api/trainer/date-availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          available_date: formattedDate,
          start_time: startTime,
          end_time: endTime,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Błąd')
      }

      const newSlot = await response.json()
      setSlots([...slots, newSlot])
      setSuccess('✅ Slot dodany')
      setSelectedDate(new Date())
      setStartTime('10:00')
      setEndTime('18:00')

      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSlot = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć?')) return

    try {
      setDeleting(id)
      const response = await fetch('/api/trainer/date-availability', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      })

      if (!response.ok) throw new Error('Błąd usuwania')

      setSlots(slots.filter(s => s.id !== id))
      setSuccess('✅ Slot usunięty')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Ładowanie...</div>
  }

  return (
    <div className="space-y-6">
      {/* Add Slot Form */}
      <form onSubmit={handleAddSlot} className="bg-white rounded-lg border p-6 space-y-4">
        <h2 className="text-xl font-semibold">📅 Dodaj dostępność</h2>

        <div>
          <label className="block text-sm font-medium mb-2">Wybierz datę</label>
          <DatePicker
            selected={selectedDate}
            onChange={(date: Date | null) => setSelectedDate(date)}
            minDate={new Date()}
            dateFormat="dd.MM.yyyy"
            locale={pl}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Początek</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Koniec</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">{success}</div>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Dodaj slot
        </button>
      </form>

      {/* Slots List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">📋 Twoja dostępność</h2>
        {slots.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Brak dodanych slotów</div>
        ) : (
          <div className="space-y-3">
            {slots
              .sort((a, b) => new Date(a.available_date).getTime() - new Date(b.available_date).getTime())
              .map((slot) => (
                <div key={slot.id} className="bg-white border rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock size={20} className="text-blue-600" />
                    <div>
                      <div className="font-medium">
                        {format(parseISO(slot.available_date), 'EEEE, d MMMM yyyy', { locale: pl })}
                      </div>
                      <div className="text-sm text-gray-600">
                        {slot.start_time} – {slot.end_time}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteSlot(slot.id)}
                    disabled={deleting === slot.id}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                    title="Usuń"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
