'use client'
import { useState } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import RegistrationStatusButton from '@/components/RegistrationStatusButton'
import { formatDate, formatDateShort } from '@/lib/utils'
import type { FormField, Registration } from '@/types'

interface Props {
  initialRegistrations: Registration[]
  eventFormFields: FormField[]
  groupingField: string | null
  eventId: string
}

export default function RegistrationsClientList({
  initialRegistrations,
  eventFormFields,
  groupingField,
}: Props) {
  const sorted = [...initialRegistrations].sort((a, b) => {
    if (a.order_index != null && b.order_index != null) return a.order_index - b.order_index
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const [registrations, setRegistrations] = useState<Registration[]>(sorted)
  const [saving, setSaving] = useState(false)

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const { source, destination } = result
    if (source.index === destination.index) return

    const newList = [...registrations]
    const [moved] = newList.splice(source.index, 1)
    newList.splice(destination.index, 0, moved)
    setRegistrations(newList)

    setSaving(true)
    try {
      await fetch('/api/registrations/reorder', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: newList.map((r, i) => ({ id: r.id, order_index: i + 1 })),
        }),
      })
    } catch {}
    setSaving(false)
  }

  function renderFormData(reg: Registration) {
    if (!reg.form_data || !Object.keys(reg.form_data).length) return null
    return (
      <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
        {eventFormFields
          .filter(f => reg.form_data[f.id] !== undefined && reg.form_data[f.id] !== null && reg.form_data[f.id] !== '')
          .map(f => {
            const val = reg.form_data[f.id]
            let display: string
            if (Array.isArray(val)) {
              display =
                f.type === 'multidate'
                  ? val.map((d: string) => { try { return formatDateShort(d) } catch { return d } }).join(', ')
                  : (val as string[]).join(', ')
            } else {
              display = String(val)
            }
            return (
              <div key={f.id} className="flex gap-2 text-xs">
                <span className="text-slate-400 shrink-0">{f.label}:</span>
                <span className="text-slate-700 font-medium">{display}</span>
              </div>
            )
          })}
        {/* Unknown keys not in template */}
        {Object.entries(reg.form_data as Record<string, unknown>)
          .filter(([k]) => !eventFormFields.some(f => f.id === k))
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="text-slate-400 shrink-0">{k}:</span>
              <span className="text-slate-700 font-medium">
                {Array.isArray(v) ? (v as string[]).join(', ') : String(v)}
              </span>
            </div>
          ))}
      </div>
    )
  }

  function renderCard(reg: Registration, dragHandle?: React.ReactNode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (reg as any).participants
    return (
      <div className="card">
        <div className="flex items-start gap-2">
          {dragHandle}
          <div className="flex items-start justify-between gap-3 flex-1 min-w-0">
            <div className="min-w-0">
              <p className="font-medium text-slate-800">
                🐕 {p?.dog_name ?? '—'}
                {p?.dog_breed && (
                  <span className="text-slate-400 font-normal text-sm ml-1.5">({p.dog_breed})</span>
                )}
              </p>
              <p className="text-sm text-slate-600">👤 {p?.owner_name ?? '—'}</p>
              {p?.owner_email && <p className="text-xs text-slate-400">{p.owner_email}</p>}
              <p className="text-xs text-slate-400 mt-0.5">{formatDate(reg.created_at)}</p>
            </div>
            <RegistrationStatusButton regId={reg.id} status={reg.status} />
          </div>
        </div>
        {renderFormData(reg)}
      </div>
    )
  }

  // --- Grouped view (no DnD) ---
  if (groupingField) {
    const groupMap = new Map<string, Registration[]>()
    for (const reg of registrations) {
      const val = (reg.form_data as Record<string, unknown>)?.[groupingField]
      const keys: string[] = Array.isArray(val)
        ? (val as string[])
        : val != null && val !== ''
          ? [String(val)]
          : ['— brak —']
      for (const k of keys) {
        if (!groupMap.has(k)) groupMap.set(k, [])
        groupMap.get(k)!.push(reg)
      }
    }

    return (
      <div className="space-y-6">
        {[...groupMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b, 'pl'))
          .map(([group, regs]) => (
            <div key={group}>
              <h3 className="text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wide border-b border-slate-200 pb-1">
                {group}{' '}
                <span className="text-slate-400 font-normal normal-case">({regs.length})</span>
              </h3>
              <div className="space-y-2">
                {regs.map(reg => (
                  <div key={reg.id}>{renderCard(reg)}</div>
                ))}
              </div>
            </div>
          ))}
      </div>
    )
  }

  // --- DnD view ---
  return (
    <>
      {saving && (
        <p className="text-xs text-slate-400 mb-2 text-center">💾 Zapisywanie kolejności...</p>
      )}
      <p className="text-xs text-slate-400 mb-3">
        ⠿ Przeciągaj karty, aby zmienić kolejność startową uczestników.
      </p>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="registrations">
          {provided => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {registrations.map((reg, index) => (
                <Draggable key={reg.id} draggableId={reg.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={snapshot.isDragging ? 'opacity-80 scale-[1.01] shadow-lg' : ''}
                    >
                      {renderCard(
                        reg,
                        <div
                          {...provided.dragHandleProps}
                          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 mt-1 shrink-0 select-none text-lg leading-none"
                          title="Przeciągnij, aby zmienić kolejność"
                        >
                          ⠿
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </>
  )
}
