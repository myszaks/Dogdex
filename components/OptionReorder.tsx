'use client'
import React, { useId } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { GripVertical, Plus, X } from 'lucide-react'

type FieldType = 'select' | 'multiselect' | 'multidate' | string

export default function OptionReorder({
  options,
  onChange,
  type,
}: {
  options: string[]
  onChange: (next: string[]) => void
  type?: FieldType
}) {
  const idPrefix = `option-${useId().replace(/:/g, '')}`
  const items = (options || []).map((value, index) => ({
    id: `${idPrefix}-${index}`,
    value,
  }))

  function commit(next: { id: string; value: string }[]) {
    onChange(next.map(x => x.value))
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const src = result.source.index
    const dest = result.destination.index
    if (src === dest) return
    const next = Array.from(items)
    const [moved] = next.splice(src, 1)
    next.splice(dest, 0, moved)
    commit(next)
  }

  function updateValue(idx: number, val: string) {
    const next = [...items]
    next[idx] = { ...next[idx], value: val }
    commit(next)
  }

  function removeAt(idx: number) {
    const next = items.filter((_, i) => i !== idx)
    commit(next)
  }

  function addNew() {
    const newVal = type === 'multidate' ? new Date().toISOString().slice(0, 10) : ''
    const next = [...items, { id: `${idPrefix}-${items.length}`, value: newVal }]
    commit(next)
  }

  return (
    <div>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="options-droppable">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {items.length === 0 && (
                <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Brak opcji. Dodaj przynajmniej jedną przed publikacją wydarzenia.
                </p>
              )}

              {items.map((it, idx) => (
                <Draggable key={it.id} draggableId={it.id} index={idx}>
                  {(prov, snap) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      className={`flex items-center gap-2 rounded-xl ${snap.isDragging ? 'bg-white shadow-lg' : ''}`}
                    >
                      <div
                        {...prov.dragHandleProps}
                        className="flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-lg text-[#83907d] hover:bg-[#edf3e9]"
                        aria-label="Przeciągnij, aby zmienić kolejność"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>

                      {type === 'multidate' ? (
                        <>
                          <label htmlFor={`${idPrefix}-${it.id}`} className="sr-only">
                            Termin {idx + 1}
                          </label>
                          <input
                            id={`${idPrefix}-${it.id}`}
                            type="date"
                            className="form-input min-h-11 flex-1 text-sm"
                            value={it.value}
                            onChange={e => updateValue(idx, e.target.value)}
                          />
                        </>
                      ) : (
                        <>
                          <label htmlFor={`${idPrefix}-${it.id}`} className="sr-only">
                            Opcja {idx + 1}
                          </label>
                          <input
                            id={`${idPrefix}-${it.id}`}
                            className="form-input min-h-11 flex-1 text-sm"
                            value={it.value}
                            onChange={e => updateValue(idx, e.target.value)}
                          />
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => removeAt(idx)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#9a6251] hover:bg-red-50 hover:text-red-600"
                        title="Usuń"
                        aria-label="Usuń opcję"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}

              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div className="pt-2">
        <button
          type="button"
          onClick={addNew}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d6e2d0] bg-white px-3 py-2 text-xs font-semibold text-[#53614d] hover:border-[#f2a37d] hover:bg-[#fff7f2]"
        >
          <Plus className="h-3.5 w-3.5" />
          {type === 'multidate' ? 'Dodaj termin' : 'Dodaj opcję'}
        </button>
      </div>
    </div>
  )
}
