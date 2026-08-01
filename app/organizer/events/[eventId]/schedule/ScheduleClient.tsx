'use client'
import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import type { TimeSlot } from '@/types'
import ConfirmModal from '@/components/ConfirmModal'
import { AlertTriangle, Plus, X, GripVertical, PawPrint, ChevronDown, ChevronUp } from 'lucide-react'
import Modal from '@/components/Modal'
import { plForm } from '@/lib/utils'
import { formatPolishCount, polishForm, POLISH_FORMS } from '@/lib/polish'
import { scheduleSlotOptions } from '@/lib/scheduleManagement'

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
  const [unassignedOpen, setUnassignedOpen] = useState(true)
  const [movingItemId, setMovingItemId] = useState<string | null>(null)

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

  async function moveItem(virtualId: string, destSlotId: string | null) {
    const item = items.find(i => i.id === virtualId)
    if (!item || item.slotId === destSlotId) return

    if (destSlotId !== null) {
      const slot = slots.find(s => s.id === destSlotId)
      if (slot?.max_participants != null) {
        const currentCount = itemsInSlot(destSlotId).length
        if (currentCount >= slot.max_participants) {
          alert(`Termin jest pełny (maksymalnie ${formatPolishCount(slot.max_participants, [
            'uczestnik',
            'uczestników',
            'uczestników',
          ])}).`)
          return
        }
      }
    }

    const previousItem = { ...item }
    setItems(prev =>
      prev.map(i => i.id === virtualId ? { ...i, slotId: destSlotId } : i)
    )
    setMovingItemId(virtualId)
    setSaveStatus('saving')

    try {
      if (destSlotId === null) {
        if (!item.assignmentId) {
          setSaveStatus('saved')
          return
        }
        const delRes = await fetch(`/api/events/${eventId}/schedule-assignments`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignment_id: item.assignmentId }),
        })
        if (!delRes.ok) {
          const error = await delRes.json().catch(() => ({}))
          throw new Error(error.error ?? 'Nie udało się usunąć przypisania')
        }
        setItems(prev =>
          prev.map(i => i.id === virtualId
            ? { ...i, slotId: null, assignmentId: null, sentAt: null }
            : i)
        )
        setSaveStatus('saved')
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
        const assignment = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(assignment.error ?? 'Nie udało się zapisać przypisania')
        }
        setItems(prev =>
          prev.map(i => i.id === virtualId
            ? {
                ...i,
                slotId: destSlotId,
                assignmentId: assignment.id,
                sentAt: null,
              }
            : i)
        )
        setSaveStatus('saved')
      }
    } catch {
      setItems(prev =>
        prev.map(i => i.id === virtualId ? previousItem : i)
      )
      setSaveStatus('error')
    } finally {
      setMovingItemId(null)
    }
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const destSlotId = result.destination.droppableId === 'unassigned'
      ? null
      : result.destination.droppableId
    void moveItem(result.draggableId, destSlotId)
  }

  async function handleSendAll() {
    setSending(true)
    setSendResult(null)
    const res = await fetch(`/api/events/${eventId}/send-schedule`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setSendResult(`✅ Wysłano do ${plForm(data.sent, 'uczestnika', 'uczestników', 'uczestników')}${data.failed ? `, ${plForm(data.failed, 'błąd', 'błędy', 'błędów')}` : ''}.`)
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

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-3 bg-white rounded-3xl shadow-sm mb-5 overflow-hidden">
        <div className="text-center px-4 py-4">
          <p className="text-2xl font-bold text-slate-800">
            {new Set(items.map(i => i.registrationId)).size}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Potwierdzonych</p>
        </div>
        <div className="text-center px-4 py-4 border-x border-[#E2E8F0]">
          <p className="text-2xl font-bold text-[#FF8024]">{slots.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {polishForm(slots.length, POLISH_FORMS.term)}
          </p>
        </div>
        <div className="text-center px-4 py-4">
          <p className="text-2xl font-bold text-[#10B981]">{assignedCount}</p>
          <p className="text-xs text-slate-500 mt-0.5">Przypisanych</p>
        </div>
      </div>

      {/* ── Send schedule panel ── */}
      {assignedCount > 0 && (() => {
        const allAssigned = assignedCount === items.length
        const noWrongDates = wrongDateItems.length === 0
        const canSend = allAssigned && noWrongDates && !sending
        return (
          <div className="bg-white rounded-3xl shadow-sm p-4 mb-4 space-y-2">
            <p className="text-sm text-slate-600">
              Przypisano <span className="font-bold">{assignedCount}</span> / <span className="font-bold">{items.length}</span> pozycji
            </p>
            {!allAssigned && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {plForm(items.length - assignedCount, 'pies nie jest', 'psy nie są', 'psów nie ma')} przypisanych
              </p>
            )}
            {wrongDateItems.length > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {plForm(wrongDateItems.length, 'pies przypisany', 'psy przypisane', 'psów przypisanych')} do złej daty
              </p>
            )}
            <button
              onClick={handleSendAll}
              disabled={!canSend}
              title={!canSend ? 'Najpierw przypisz wszystkie psy do właściwych dat' : undefined}
              className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full py-2.5 font-medium text-sm transition-colors"
            >
              {sending ? '⏳ Wysyłanie...' : '📧 Wyślij grafik wszystkim'}
            </button>
            {sendResult && (
              <p className="text-xs font-medium text-center text-slate-700">{sendResult}</p>
            )}
          </div>
        )
      })()}

      {/* ── Save status ── */}
      {saveStatus !== 'idle' && (
        <div className={`rounded-full py-2 px-4 text-xs font-medium text-center mb-4 ${
          saveStatus === 'saving' ? 'bg-slate-100 text-slate-500' :
          saveStatus === 'saved'  ? 'bg-[#10B981]/10 text-[#10B981]' :
                                    'bg-red-50 text-red-600'
        }`}>
          {saveStatus === 'saving' ? '⏳ Zapisywanie...' :
           saveStatus === 'saved'  ? '✅ Grafik zapisany' :
                                     '❌ Błąd zapisu — spróbuj ponownie'}
        </div>
      )}

      {/* ── Wrong-date warning ── */}
      {wrongDateItems.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <span>
            <strong>{wrongDateItems.length}</strong>
            {' '}{plForm(wrongDateItems.length, 'pies przypisany', 'psy przypisane', 'psów przypisanych')} do terminu z
            {' '}niezgodną datą. Sprawdź karty oznaczone <span className="font-bold">⚠️</span>.
          </span>
        </div>
      )}

      {/* ── Main CTA ── */}
      <button
        type="button"
        onClick={() => setAddSlotOpen(true)}
        className="w-full bg-[#FF8024] hover:bg-[#E06A10] text-white rounded-full py-3.5 flex items-center justify-center gap-2 font-semibold text-sm mb-6 transition-colors shadow-sm"
      >
        <Plus className="w-5 h-5" />
        Dodaj termin
      </button>

      {/* ── Vertical Timeline ── */}
      {slots.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-sm text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">🕐</p>
          <p>Wybierz „Dodaj termin”, aby utworzyć pierwszą godzinę startu.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Dashed vertical connector running through circle centers */}
          <div className="absolute left-5 top-5 bottom-5 border-l-2 border-dashed border-[#E2E8F0]" />

          {slotDates.map(date => (
            <div key={date} className="mb-8">
              {/* Date header node */}
              <div className="flex items-center gap-4 mb-4 relative">
                <div className="w-10 h-10 rounded-full bg-[#F8FAFC] flex flex-col items-center justify-center z-10 shrink-0 shadow-sm">
                  <span className="text-[9px] font-bold text-slate-700 leading-tight">
                    {new Intl.DateTimeFormat('pl-PL', { day: 'numeric' }).format(new Date(date))}
                  </span>
                  <span className="text-[8px] font-semibold text-slate-400 uppercase leading-tight">
                    {new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(new Date(date))}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-700">{fmtLong(date)}</p>
              </div>

              {/* Slot nodes for this date */}
              <div className="space-y-4">
                {slotsByDate[date].map(slot => {
                  const inSlot = itemsInSlot(slot.id)
                  const isFull = slot.max_participants != null && inSlot.length >= slot.max_participants
                  return (
                    <div key={slot.id} className="flex items-start gap-4">
                      {/* Time badge */}
                      <div className="w-10 shrink-0 flex flex-col items-center pt-3">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center z-10 shadow-sm">
                          <span className="text-[10px] font-bold text-slate-700 leading-tight">
                            {slot.slot_time.slice(0, 5)}
                          </span>
                        </div>
                      </div>

                      {/* Slot card */}
                      <Droppable droppableId={slot.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex-1 bg-white rounded-3xl border shadow-sm overflow-hidden min-h-[80px] transition-colors ${
                              snapshot.isDraggingOver && !isFull
                                ? 'border-[#10B981] bg-[#10B981]/5'
                                : snapshot.isDraggingOver && isFull
                                ? 'border-red-400 bg-red-50'
                                : 'border-transparent'
                            }`}
                          >
                            {/* Slot header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-800 text-sm">{slot.slot_time.slice(0, 5)}</span>
                                {slot.label && (
                                  <span className="text-xs text-slate-400">{slot.label}</span>
                                )}
                                {slot.max_participants != null && (
                                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                                    isFull ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                                  }`}>
                                    {inSlot.length}/{slot.max_participants}{isFull ? ' pełny' : ''}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setDeletingSlotId(slot.id)}
                                className="text-slate-300 hover:text-red-400 transition-colors ml-2 shrink-0"
                                title="Usuń termin"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Items */}
                            <div className="p-3 space-y-2">
                              {inSlot.length === 0 && (
                                <div className="border-2 border-dashed border-[#E2E8F0] rounded-2xl p-4 flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full border-2 border-dashed border-[#E2E8F0] flex items-center justify-center shrink-0">
                                    <Plus className="w-4 h-4 text-slate-300" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-slate-400">Wolne miejsce</p>
                                    <p className="text-xs text-slate-300">Przypisz uczestnika</p>
                                  </div>
                                </div>
                              )}
                              {inSlot.map((item, i) => (
                                <TimelineItemCard
                                  key={item.id}
                                  item={item}
                                  index={i}
                                  wrongDate={isWrongDate(item)}
                                  slots={slots}
                                  items={items}
                                  moving={movingItemId === item.id}
                                  onMove={moveItem}
                                />
                              ))}
                              {provided.placeholder}
                            </div>
                          </div>
                        )}
                      </Droppable>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Unassigned accordion ── */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setUnassignedOpen(prev => !prev)}
          className="w-full flex items-center justify-between bg-white border border-transparent rounded-3xl px-5 py-4 shadow-sm hover:border-amber-300 transition-colors"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="font-semibold text-slate-700">Nieprzypisani ({unassigned.length})</span>
          </div>
          {unassignedOpen
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />
          }
        </button>

        {unassignedOpen && (
          <div className="mt-2">
            <Droppable droppableId="unassigned">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`bg-white rounded-3xl border p-4 min-h-[60px] transition-colors shadow-sm ${
                    snapshot.isDraggingOver ? 'border-amber-300 bg-amber-50' : 'border-transparent'
                  }`}
                >
                  {unassigned.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">
                      Wszyscy uczestnicy zostali przypisani 🎉
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {unassigned.map((item, i) => (
                        <UnassignedItemCard
                          key={item.id}
                          item={item}
                          index={i}
                          slots={slots}
                          items={items}
                          moving={movingItemId === item.id}
                          onMove={moveItem}
                        />
                      ))}
                    </div>
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        )}
      </div>

      {/* ── Add Slot modal ── */}
      <Modal open={addSlotOpen} onClose={() => setAddSlotOpen(false)} title="Dodaj termin">
        <div className="space-y-4">
          <div>
            <label htmlFor="schedule-slot-date" className="form-label">Data *</label>
            {availableDates.length > 0 ? (
              <select id="schedule-slot-date" value={newDate} onChange={e => setNewDate(e.target.value)} className="form-input">
                <option value="">— wybierz datę —</option>
                {availableDates.map(d => (
                  <option key={d} value={d}>{fmtShort(d)} ({d})</option>
                ))}
              </select>
            ) : (
              <input id="schedule-slot-date" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="form-input" />
            )}
          </div>
          <div>
            <label htmlFor="schedule-slot-time" className="form-label">Godzina *</label>
            <input
              id="schedule-slot-time"
              type="time"
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <label htmlFor="schedule-slot-label" className="form-label">Etykieta <span className="text-slate-400 font-normal">(opcjonalna)</span></label>
            <input
              id="schedule-slot-label"
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              className="form-input"
              placeholder="np. Trasa A, Grupa 1"
            />
          </div>
          <div>
            <label htmlFor="schedule-slot-capacity" className="form-label">Limit miejsc <span className="text-slate-400 font-normal">(opcjonalny)</span></label>
            <input
              id="schedule-slot-capacity"
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
              {addingSlot ? '⏳ Dodawanie...' : '+ Dodaj termin'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={deletingSlotId !== null}
        title="Usunąć termin?"
        message="Przypisania uczestników do tego terminu zostaną usunięte."
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

function TimelineItemCard({
  item,
  index,
  wrongDate,
  slots,
  items,
  moving,
  onMove,
}: {
  item: ScheduleItem
  index: number
  wrongDate: boolean
  slots: TimeSlot[]
  items: ScheduleItem[]
  moving: boolean
  onMove: (itemId: string, slotId: string | null) => Promise<void>
}) {
  const isConfirmed = item.sentAt !== null
  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`flex items-start gap-3 p-3 rounded-2xl border bg-white select-none transition-shadow ${
            snapshot.isDragging
              ? 'shadow-lg border-sky-300'
              : wrongDate
              ? 'border-amber-300 bg-amber-50'
              : 'border-transparent'
          }`}
        >
          <button
            type="button"
            {...provided.dragHandleProps}
            className="mt-2 shrink-0 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            aria-label={`Przeciągnij ${item.dog_name ?? 'uczestnika'}, aby zmienić termin`}
          >
            <GripVertical className="w-4 h-4" />
          </button>

          {/* Coloured left stripe */}
          <div
            className={`w-1 self-stretch rounded-full shrink-0 ${
              wrongDate ? 'bg-amber-400' : isConfirmed ? 'bg-[#10B981]' : 'bg-slate-300'
            }`}
          />

          {/* Dog avatar */}
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-lg">
            🐕
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-800 truncate text-sm">{item.dog_name ?? '—'}</p>
              {isConfirmed ? (
                <span className="text-[10px] font-medium bg-[#10B981]/10 text-[#10B981] rounded-full px-2 py-0.5 shrink-0">
                  Wysłano
                </span>
              ) : (
                <span className="text-[10px] font-medium bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 shrink-0">
                  Robocze
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate">{item.owner_name ?? '—'}</p>
            {item.itemDate && (
              <span className="inline-block text-[10px] font-medium bg-sky-100 text-sky-700 rounded-full px-2 py-0.5 mt-1 leading-tight">
                {fmtShort(item.itemDate)}
              </span>
            )}
            <ScheduleAssignmentSelect
              item={item}
              slots={slots}
              items={items}
              disabled={moving}
              onMove={onMove}
            />
          </div>

          {/* Actions / indicators */}
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            {wrongDate && (
              <span title={`Nieprawidłowy dzień: pies jest zapisany na ${fmtShort(item.itemDate)}, a termin przypada w innym dniu.`}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}

function UnassignedItemCard({
  item,
  index,
  slots,
  items,
  moving,
  onMove,
}: {
  item: ScheduleItem
  index: number
  slots: TimeSlot[]
  items: ScheduleItem[]
  moving: boolean
  onMove: (itemId: string, slotId: string | null) => Promise<void>
}) {
  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`flex items-center gap-3 p-3 rounded-2xl border bg-white select-none transition-shadow ${
            snapshot.isDragging ? 'shadow-lg border-sky-300' : 'border-transparent'
          }`}
        >
          <button
            type="button"
            {...provided.dragHandleProps}
            className="shrink-0 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            aria-label={`Przeciągnij ${item.dog_name ?? 'uczestnika'}, aby przypisać termin`}
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <PawPrint className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-700 truncate text-sm">{item.dog_name ?? '—'}</p>
            <p className="text-xs text-slate-400 truncate">{item.owner_name ?? '—'}</p>
            <ScheduleAssignmentSelect
              item={item}
              slots={slots}
              items={items}
              disabled={moving}
              onMove={onMove}
            />
          </div>
          {item.itemDate && (
            <span className="text-[10px] font-medium bg-sky-100 text-sky-700 rounded-full px-2 py-0.5 shrink-0">
              {fmtShort(item.itemDate)}
            </span>
          )}
        </div>
      )}
    </Draggable>
  )
}

function ScheduleAssignmentSelect({
  item,
  slots,
  items,
  disabled,
  onMove,
}: {
  item: ScheduleItem
  slots: TimeSlot[]
  items: ScheduleItem[]
  disabled: boolean
  onMove: (itemId: string, slotId: string | null) => Promise<void>
}) {
  const selectId = `schedule-slot-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const slotOptions = scheduleSlotOptions(slots, items, item.itemDate, item.slotId)

  return (
    <div className="mt-2">
      <label htmlFor={selectId} className="sr-only">
        Termin dla psa {item.dog_name ?? 'bez nazwy'}
      </label>
      <select
        id={selectId}
        value={item.slotId ?? ''}
        disabled={disabled}
        onChange={event => void onMove(item.id, event.target.value || null)}
        className="h-8 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 disabled:opacity-60"
      >
        <option value="">
          {item.slotId ? 'Usuń przypisanie' : 'Wybierz termin…'}
        </option>
        {slotOptions.map(({ slot, full }) => {
          const label = [
            fmtShort(slot.slot_date),
            slot.slot_time.slice(0, 5),
            slot.label,
            full ? 'pełny' : null,
          ].filter(Boolean).join(' · ')

          return (
            <option key={slot.id} value={slot.id} disabled={full}>
              {label}
            </option>
          )
        })}
      </select>
    </div>
  )
}
