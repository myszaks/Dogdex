'use client'
import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import type { TimeSlot } from '@/types'
import ConfirmModal from '@/components/ConfirmModal'
import { AlertTriangle, Plus, X } from 'lucide-react'
import Modal from '@/components/Modal'

interface Participant {
  registrationId: string
  dog_name: string | null
  owner_name: string | null
  dog_breed: string | null
  form_data: Record<string, unknown>
}

interface ScheduleAssignment {
  id: string
  registration_id: string
  time_slot_id: string
  item_date: string
  sent_at: string | null
}

interface ScheduleItem {
  id: string
  registrationId: string
  itemDate: string
  dog_name: string | null
  owner_name: string | null
  slotId: string | null
  assignmentId: string | null
  sentAt: string | null
}

interface Props {
  eventId: string
  initialSlots: TimeSlot[]
  initialParticipants: Participant[]
  initialAssignments: ScheduleAssignment[]
  multiDateFieldIds: string[]
  availableDates: string[]
}

function fmtShort(d: string) {
  if (!d) return ''
  return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(d))
}

function fmtLong(d: string) {
  if (!d) return ''
  return new Intl.DateTimeFormat('pl-PL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(d))
}

function buildItems(
  participants: Participant[],
  assignments: ScheduleAssignment[],
  multiDateFieldIds: string[],
): ScheduleItem[] {
  const items: ScheduleItem[] = []
  for (const p of participants) {
    const selectedDates: string[] = multiDateFieldIds.flatMap(fid => {
      const val = p.form_data[fid]
      return Array.isArray(val) ? (val as string[]) : []
    })
    const dates = selectedDates.length > 0 ? selectedDates : ['']
    for (const date of dates) {
      const virtualId = `${p.registrationId}::${date}`
      const assignment = assignments.find(
        a => a.registration_id === p.registrationId && a.item_date === date
      )
      items.push({
        id: virtualId,
        registrationId: p.registrationId,
        itemDate: date,
        dog_name: p.dog_name,
        owner_name: p.owner_name,
        slotId: assignment?.time_slot_id ?? null,
        assignmentId: assignment?.id ?? null,
        sentAt: assignment?.sent_at ?? null,
      })
    }
  }
  return items
}

export default function ScheduleClient({
  eventId,
  initialSlots,
  initialParticipants,
  initialAssignments,
  multiDateFieldIds,
  availableDates,
}: Props) {
  const [slots, setSlots] = useState<TimeSlot[]>(initialSlots)
  const [items, setItems] = useState<ScheduleItem[]>(
    () => buildItems(initialParticipants, initialAssignments, multiDateFieldIds)
  )
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null)
  const [addSlotOpen, setAddSlotOpen] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newMax, setNewMax] = useState('')
  const [addingSlot, setAddingSlot] = useState(false)

  const timeOptions: string[] = []
  for (let h = 6; h <= 22; h++) {
    timeOptions.push(`${String(h).padStart(2, '0')}:00`)
    if (h < 22) timeOptions.push(`${String(h).padStart(2, '0')}:30`)
  }

  const slotMap = new Map(slots.map(s => [s.id, s]))

  const itemsInSlot = (slotId: string) => items.filter(i => i.slotId === slotId)
  const unassigned = items.filter(i => i.slotId === null)
  const assignedCount = items.filter(i => i.slotId !== null).length

  const isWrongDate = (item: ScheduleItem): boolean => {
    if (!item.slotId || !item.itemDate) return false
    const slot = slotMap.get(item.slotId)
    return !!slot && slot.slot_date !== item.itemDate
  }

  const wrongDateItems = items.filter(isWrongDate)

  const slotsByDate: Record<string, TimeSlot[]> = {}
  for (const s of slots) {
    if (!slotsByDate[s.slot_date]) slotsByDate[s.slot_date] = []
    slotsByDate[s.slot_date].push(s)
  }
  const slotDates = Object.keys(slotsByDate).sort()

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
      setSlots(prev =>
        [...prev, slot].sort((a, b) =>
          a.slot_date === b.slot_date
            ? a.slot_time.localeCompare(b.slot_time)
            : a.slot_date.localeCompare(b.slot_date)
        )
      )
      setNewDate(''); setNewTime(''); setNewLabel(''); setNewMax('')
      setAddSlotOpen(false)
    }
    setAddingSlot(false)
  }

  async function handleDeleteSlot(slotId: string) {
    const res = await fetch(`/api/events/${eventId}/time-slots/${slotId}`, { method: 'DELETE' })
    if (res.ok) {
      setSlots(prev => prev.filter(s => s.id !== slotId))
      setItems(prev =>
        prev.map(i => i.slotId === slotId
          ? { ...i, slotId: null, assignmentId: null, sentAt: null }
          : i)
      )
    }
  }

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const virtualId = result.draggableId
    const destSlotId = result.destination.droppableId === 'unassigned'
      ? null
      : result.destination.droppableId

    const item = items.find(i => i.id === virtualId)
    if (!item || item.slotId === destSlotId) return

    if (destSlotId !== null) {
      const slot = slots.find(s => s.id === destSlotId)
      if (slot?.max_participants != null) {
        const currentCount = itemsInSlot(destSlotId).length
        if (currentCount >= slot.max_participants) {
          alert(`Slot jest pełny (max ${slot.max_participants}).`)
          return
        }
      }
    }

    setItems(prev =>
      prev.map(i => i.id === virtualId ? { ...i, slotId: destSlotId } : i)
    )

    setSaveStatus('saving')
    if (destSlotId === null) {
      if (item.assignmentId) {
        const delRes = await fetch(`/api/events/${eventId}/schedule-assignments`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignment_id: item.assignmentId }),
        })
        setItems(prev =>
          prev.map(i => i.id === virtualId
            ? { ...i, slotId: null, assignmentId: null, sentAt: null }
            : i)
        )
        setSaveStatus(delRes.ok ? 'saved' : 'error')
      } else {
        setSaveStatus('saved')
      }
    } else {
      const res = await fetch(`/api/events/${eventId}/schedule-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_id: item.registrationId,
          time_slot_id: destSlotId,
          item_date: item.itemDate,
        }),
      })
      if (res.ok) {
        const assignment = await res.json()
        setItems(prev =>
          prev.map(i => i.id === virtualId ? { ...i, assignmentId: assignment.id } : i)
        )
        setSaveStatus('saved')
      } else {
        // Revert optimistic update on failure
        setItems(prev =>
          prev.map(i => i.id === virtualId ? { ...i, slotId: item.slotId } : i)
        )
        setSaveStatus('error')
      }
    }
  }

  async function handleSendAll() {
    setSending(true)
    setSendResult(null)
    const res = await fetch(`/api/events/${eventId}/send-schedule`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setSendResult(`✅ Wysłano do ${data.sent} uczestników${data.failed ? `, ${data.failed} błędów` : ''}.`)
      setItems(prev =>
        prev.map(i => i.slotId !== null ? { ...i, sentAt: new Date().toISOString() } : i)
      )
    } else {
      setSendResult(`❌ ${data.error}`)
    }
    setSending(false)
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 items-start">

        {/* LEFT PANEL */}
        <div className="w-64 shrink-0 space-y-3">

          {assignedCount > 0 && (() => {
            const allAssigned = assignedCount === items.length
            const noWrongDates = wrongDateItems.length === 0
            const canSend = allAssigned && noWrongDates && !sending
            return (
              <div className="card bg-blue-50 border-blue-200 space-y-2">
                <p className="text-xs text-blue-600">
                  Przypisano {assignedCount} / {items.length} pozycji
                </p>
                {!allAssigned && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {items.length - assignedCount} {items.length - assignedCount === 1 ? 'pies nie jest' : 'psy nie są'} przypisane
                  </p>
                )}
                {wrongDateItems.length > 0 && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {wrongDateItems.length} {wrongDateItems.length === 1 ? 'pies przypisany' : 'psy przypisane'} do złej daty
                  </p>
                )}
                <button
                  onClick={handleSendAll}
                  disabled={!canSend}
                  title={!canSend ? 'Najpierw przypisz wszystkie psy do właściwych dat' : undefined}
                  className="btn btn-primary btn-sm w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? '⏳ Wysyłanie...' : '📧 Wyślij grafik wszystkim'}
                </button>
                {sendResult && (
                  <p className="text-xs font-medium text-center text-slate-700">{sendResult}</p>
                )}
              </div>
            )
          })()}

          <button
            type="button"
            onClick={() => setAddSlotOpen(true)}
            className="btn btn-primary btn-sm w-full flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Dodaj slot
          </button>

          {saveStatus !== 'idle' && (
            <p className={`text-xs text-center font-medium rounded-lg py-1.5 px-2 ${
              saveStatus === 'saving' ? 'bg-slate-100 text-slate-500' :
              saveStatus === 'saved'  ? 'bg-green-50 text-green-700' :
                                        'bg-red-50 text-red-600'
            }`}>
              {saveStatus === 'saving' ? '⏳ Zapisywanie...' :
               saveStatus === 'saved'  ? '✅ Grafik zapisany' :
                                         '❌ Błąd zapisu — spróbuj ponownie'}
            </p>
          )}

          {wrongDateItems.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <span>
                <strong>{wrongDateItems.length}</strong>
                {wrongDateItems.length === 1 ? ' pies przypisany' : ' psy przypisane'} do slotu z
                {' '}niezgodną datą. Sprawdź karty oznaczone <span className="font-bold">⚠️</span>.
              </span>
            </div>
          )}

          <Droppable droppableId="unassigned">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`card min-h-[100px] transition-colors ${
                  snapshot.isDraggingOver ? 'bg-amber-50 border-amber-300' : 'bg-slate-50'
                }`}
              >
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Nieprzypisani ({unassigned.length})
                </p>
                {unassigned.map((item, i) => (
                  <ItemCard key={item.id} item={item} index={i} wrongDate={false} />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 overflow-x-auto min-w-0">
          {slots.length === 0 ? (
            <div className="card text-center py-16 text-slate-400">
              <p className="text-4xl mb-3">🕐</p>
              <p>Otwórz "Dodaj slot" i utwórz pierwszy termin</p>
            </div>
          ) : (
            <div className="flex gap-4 items-start">
              {slotDates.map(date => (
                <div key={date} className="shrink-0 w-52 space-y-3">
                  {/* Date column header */}
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide capitalize px-1">
                    {fmtLong(date)}
                  </p>
                  {slotsByDate[date].map(slot => {
                    const inSlot = itemsInSlot(slot.id)
                    const isFull =
                      slot.max_participants != null && inSlot.length >= slot.max_participants
                    return (
                      <Droppable key={slot.id} droppableId={slot.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`card min-h-[80px] transition-colors ${
                              snapshot.isDraggingOver && !isFull
                                ? 'bg-green-50 border-green-300'
                                : snapshot.isDraggingOver && isFull
                                ? 'bg-red-50 border-red-300'
                                : 'bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="text-lg font-bold text-slate-800 leading-none">
                                  {slot.slot_time.slice(0, 5)}
                                </p>
                                {slot.label && (
                                  <p className="text-xs text-slate-400 mt-0.5">{slot.label}</p>
                                )}
                                {slot.max_participants != null && (
                                  <p className={`text-xs font-medium mt-0.5 ${isFull ? 'text-red-500' : 'text-slate-400'}`}>
                                    {inSlot.length}/{slot.max_participants}
                                    {isFull ? ' (pełny)' : ''}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setDeletingSlotId(slot.id)}
                                className="text-slate-300 hover:text-red-400"
                                title="Usuń slot"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {inSlot.map((item, i) => (
                              <ItemCard key={item.id} item={item} index={i} wrongDate={isWrongDate(item)} />
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={addSlotOpen} onClose={() => setAddSlotOpen(false)} title="Dodaj slot godzinowy">
        <div className="space-y-4">
          <div>
            <label className="form-label">Data *</label>
            {availableDates.length > 0 ? (
              <select value={newDate} onChange={e => setNewDate(e.target.value)} className="form-input">
                <option value="">— wybierz datę —</option>
                {availableDates.map(d => (
                  <option key={d} value={d}>{fmtShort(d)} ({d})</option>
                ))}
              </select>
            ) : (
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="form-input" />
            )}
          </div>
          <div>
            <label className="form-label">Godzina *</label>
            <select value={newTime} onChange={e => setNewTime(e.target.value)} className="form-input">
              <option value="">— wybierz —</option>
              {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Etykieta <span className="text-slate-400 font-normal">(opcjonalna)</span></label>
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              className="form-input"
              placeholder="np. Trasa A, Grupa 1"
            />
          </div>
          <div>
            <label className="form-label">Limit miejsc <span className="text-slate-400 font-normal">(opcjonalny)</span></label>
            <input
              type="number"
              min="1"
              value={newMax}
              onChange={e => setNewMax(e.target.value)}
              className="form-input"
              placeholder="bez limitu"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setAddSlotOpen(false)}
              className="btn btn-secondary flex-1"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleAddSlot}
              disabled={addingSlot || !newDate || !newTime}
              className="btn btn-primary flex-1"
            >
              {addingSlot ? '⏳ Dodawanie...' : '+ Dodaj slot'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={deletingSlotId !== null}
        title="Usunąć slot?"
        message="Uczestnicy przypisani do tego slotu zostaną odpisani."
        confirmLabel="Usuń"
        danger
        onConfirm={() => {
          const id = deletingSlotId!
          setDeletingSlotId(null)
          handleDeleteSlot(id)
        }}
        onCancel={() => setDeletingSlotId(null)}
      />
    </DragDropContext>
  )
}

function ItemCard({ item, index, wrongDate }: { item: ScheduleItem; index: number; wrongDate: boolean }) {
  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`flex items-start gap-2 p-2 mb-1.5 rounded-lg border text-sm select-none transition-shadow ${
            snapshot.isDragging
              ? 'shadow-lg bg-white border-sky-300 rotate-1'
              : wrongDate
              ? 'bg-amber-50 border-amber-300 hover:border-amber-400'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-base shrink-0 mt-0.5">🐕</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-800 truncate leading-tight">
              {item.dog_name ?? '—'}
            </p>
            <p className="text-xs text-slate-400 truncate">{item.owner_name ?? '—'}</p>
            {item.itemDate && (
              <span className="inline-block text-[10px] font-medium bg-sky-100 text-sky-700 rounded px-1.5 py-0.5 mt-1 leading-tight">
                {fmtShort(item.itemDate)}
              </span>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            {wrongDate && (
              <span title={`Zły dzień! Pies zgłoszony na ${fmtShort(item.itemDate)}, slot jest w innym dniu.`}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              </span>
            )}
            {item.sentAt && (
              <span className="text-xs" title="Grafik wysłany">✉️</span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}
