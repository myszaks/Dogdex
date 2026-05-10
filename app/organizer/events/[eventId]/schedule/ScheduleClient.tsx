'use client'
import { useState, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import type { TimeSlot } from '@/types'
import ConfirmModal from '@/components/ConfirmModal'

interface Participant {
  registrationId: string
  participantId: string
  dog_name: string | null
  owner_name: string | null
  dog_breed: string | null
  schedule_sent_at: string | null
  time_slot_id: string | null
}

interface Props {
  eventId: string
  initialSlots: TimeSlot[]
  initialParticipants: Participant[]
}

function slotLabel(slot: TimeSlot) {
  const time = slot.slot_time.slice(0, 5)
  const date = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(
    new Date(slot.slot_date)
  )
  return slot.label ? `${time} – ${slot.label} (${date})` : `${time} (${date})`
}

export default function ScheduleClient({ eventId, initialSlots, initialParticipants }: Props) {
  const [slots, setSlots] = useState<TimeSlot[]>(initialSlots)
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null)

  // New slot form state
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newMax, setNewMax] = useState('')
  const [addingSlot, setAddingSlot] = useState(false)

  const participantsInSlot = useCallback(
    (slotId: string | null) =>
      participants.filter(p => p.time_slot_id === slotId),
    [participants]
  )

  async function handleAddSlot() {
    if (!newDate || !newTime) return
    setAddingSlot(true)
    const res = await fetch(`/api/events/${eventId}/time-slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_date: newDate,
        slot_time: newTime,
        label: newLabel || null,
        max_participants: newMax ? parseInt(newMax) : null,
      }),
    })
    if (res.ok) {
      const slot = await res.json()
      setSlots(prev => [...prev, slot].sort((a, b) =>
        a.slot_date === b.slot_date
          ? a.slot_time.localeCompare(b.slot_time)
          : a.slot_date.localeCompare(b.slot_date)
      ))
      setNewDate(''); setNewTime(''); setNewLabel(''); setNewMax('')
    }
    setAddingSlot(false)
  }

  async function handleDeleteSlot(slotId: string) {
    const res = await fetch(`/api/events/${eventId}/time-slots/${slotId}`, { method: 'DELETE' })
    if (res.ok) {
      setSlots(prev => prev.filter(s => s.id !== slotId))
      setParticipants(prev =>
        prev.map(p => p.time_slot_id === slotId ? { ...p, time_slot_id: null } : p)
      )
    }
  }

  async function assignParticipant(registrationId: string, slotId: string | null) {
    const res = await fetch(`/api/registrations/${registrationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time_slot_id: slotId }),
    })
    if (res.ok) {
      setParticipants(prev =>
        prev.map(p => p.registrationId === registrationId ? { ...p, time_slot_id: slotId } : p)
      )
    }
  }

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const { draggableId } = result
    const destSlotId = result.destination.droppableId === 'unassigned' ? null : result.destination.droppableId

    // Check max_participants limit
    if (destSlotId !== null) {
      const slot = slots.find(s => s.id === destSlotId)
      if (slot?.max_participants !== null && slot?.max_participants !== undefined) {
        const currentCount = participantsInSlot(destSlotId).length
        if (currentCount >= slot.max_participants) {
          alert(`Slot jest pełny (max ${slot.max_participants} uczestników).`)
          return
        }
      }
    }

    // Optimistic update
    setParticipants(prev =>
      prev.map(p => p.registrationId === draggableId ? { ...p, time_slot_id: destSlotId } : p)
    )

    await assignParticipant(draggableId, destSlotId)
  }

  async function handleSendAll() {
    setSending(true)
    setSendResult(null)
    const res = await fetch(`/api/events/${eventId}/send-schedule`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setSendResult(`✅ Wysłano do ${data.sent} uczestników${data.failed ? `, ${data.failed} błędów` : ''}.`)
      // Mark sent_at locally
      setParticipants(prev =>
        prev.map(p => p.time_slot_id !== null ? { ...p, schedule_sent_at: new Date().toISOString() } : p)
      )
    } else {
      setSendResult(`❌ ${data.error}`)
    }
    setSending(false)
  }

  const unassigned = participantsInSlot(null)
  const assignedCount = participants.filter(p => p.time_slot_id !== null).length

  return (
    <div className="space-y-6">
      {/* Add slot form */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-700">➕ Dodaj slot godzinowy</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="form-label">Data *</label>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="form-label">Godzina *</label>
            <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="form-label">Etykieta</label>
            <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="form-input" placeholder="np. Trasa A" />
          </div>
          <div>
            <label className="form-label">Limit miejsc</label>
            <input type="number" min="1" value={newMax} onChange={e => setNewMax(e.target.value)} className="form-input" placeholder="bez limitu" />
          </div>
        </div>
        <button
          type="button"
          onClick={handleAddSlot}
          disabled={addingSlot || !newDate || !newTime}
          className="btn btn-primary btn-sm"
        >
          {addingSlot ? '...' : '+ Dodaj slot'}
        </button>
      </div>

      {/* Send schedule button */}
      {assignedCount > 0 && (
        <div className="card bg-blue-50 border-blue-200 flex items-center gap-3 flex-wrap">
          <div className="flex-1">
            <p className="font-semibold text-blue-800">📧 Wyślij grafik</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Przypisano {assignedCount} / {participants.length} uczestników
            </p>
          </div>
          <button
            type="button"
            onClick={handleSendAll}
            disabled={sending}
            className="btn btn-primary btn-sm shrink-0"
          >
            {sending ? '⏳ Wysyłanie...' : '📧 Wyślij wszystkim'}
          </button>
        </div>
      )}
      {sendResult && (
        <p className="text-sm font-medium text-center text-slate-700 bg-slate-100 rounded-lg py-2 px-4">
          {sendResult}
        </p>
      )}

      {/* DnD board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Unassigned column */}
          <Droppable droppableId="unassigned">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`card min-h-[120px] transition-colors ${snapshot.isDraggingOver ? 'bg-yellow-50 border-yellow-300' : 'bg-slate-50'}`}
              >
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Nieprzypisani ({unassigned.length})
                </p>
                {unassigned.map((p, i) => (
                  <ParticipantCard key={p.registrationId} participant={p} index={i} />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          {/* Slot columns */}
          {slots.map(slot => {
            const inSlot = participantsInSlot(slot.id)
            const isFull = slot.max_participants !== null && inSlot.length >= slot.max_participants
            return (
              <Droppable key={slot.id} droppableId={slot.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`card min-h-[120px] transition-colors ${snapshot.isDraggingOver && !isFull ? 'bg-green-50 border-green-300' : snapshot.isDraggingOver && isFull ? 'bg-red-50 border-red-300' : 'bg-white'}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {slot.slot_time.slice(0, 5)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(slot.slot_date))}
                          {slot.label ? ` – ${slot.label}` : ''}
                        </p>
                        {slot.max_participants !== null && (
                          <p className={`text-xs font-medium mt-0.5 ${isFull ? 'text-red-600' : 'text-slate-400'}`}>
                            {inSlot.length} / {slot.max_participants} {isFull ? '(pełny)' : ''}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeletingSlotId(slot.id)}
                        className="text-red-400 hover:text-red-600 text-xs shrink-0"
                        title="Usuń slot"
                      >
                        ✕
                      </button>
                    </div>
                    {inSlot.map((p, i) => (
                      <ParticipantCard key={p.registrationId} participant={p} index={i} />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            )
          })}
        </div>
      </DragDropContext>

      {slots.length === 0 && (
        <div className="card text-center py-8 text-slate-400">
          <p className="text-3xl mb-2">🕐</p>
          <p>Dodaj pierwszy slot godzinowy powyżej</p>
        </div>
      )}
      <ConfirmModal
        open={deletingSlotId !== null}
        title="Usunąć slot?"
        message="Uczestnicy przypisani do tego slotu zostaną odpisani."
        confirmLabel="Usuń"
        danger
        onConfirm={() => { const id = deletingSlotId!; setDeletingSlotId(null); handleDeleteSlot(id) }}
        onCancel={() => setDeletingSlotId(null)}
      />
    </div>
  )
}({ participant, index }: { participant: Participant; index: number }) {
  return (
    <Draggable draggableId={participant.registrationId} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`flex items-center gap-2 p-2 mb-2 rounded-lg border text-sm select-none transition-shadow ${snapshot.isDragging ? 'shadow-md bg-white border-sky-300 rotate-1' : 'bg-white border-slate-200 hover:border-slate-300'}`}
        >
          <span className="text-base shrink-0">🐕</span>
          <div className="min-w-0">
            <p className="font-medium text-slate-800 truncate">{participant.dog_name ?? '—'}</p>
            <p className="text-xs text-slate-400 truncate">{participant.owner_name ?? '—'}</p>
          </div>
          {participant.schedule_sent_at && (
            <span className="ml-auto text-green-500 shrink-0 text-xs" title="Grafik wysłany">✉️</span>
          )}
        </div>
      )}
    </Draggable>
  )
}
