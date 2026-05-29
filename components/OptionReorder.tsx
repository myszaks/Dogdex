'use client'
import React, { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'

function genId() {
  return Math.random().toString(36).slice(2, 9)
}

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
  const [items, setItems] = useState(() => (options || []).map(o => ({ id: genId(), value: o })))

  // Keep internal items in sync when parent options change
  useEffect(() => {
    setItems(prev =>
      (options || []).map((opt, i) => (prev[i] ? { id: prev[i].id, value: opt } : { id: genId(), value: opt }))
    )
  }, [options])

  function commit(next: { id: string; value: string }[]) {
    setItems(next)
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
    const next = [...items, { id: genId(), value: newVal }]
    commit(next)
  }

  return (
    <div>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="options-droppable">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {items.length === 0 && (
                <p className="text-xs text-slate-400 italic py-0.5">Brak opcji — dodaj poniżej</p>
              )}

              {items.map((it, idx) => (
                <Draggable key={it.id} draggableId={it.id} index={idx}>
                  {(prov, snap) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      className="flex items-center gap-2"
                    >
                      <div {...prov.dragHandleProps} className="px-2 text-slate-400 cursor-grab">☰</div>

                      {type === 'multidate' ? (
                        <input
                          type="date"
                          className="form-input flex-1 text-sm py-1"
                          value={it.value}
                          onChange={e => updateValue(idx, e.target.value)}
                        />
                      ) : (
                        <input
                          className="form-input flex-1 text-sm py-1"
                          value={it.value}
                          onChange={e => updateValue(idx, e.target.value)}
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => removeAt(idx)}
                        className="text-red-400 hover:text-red-600 px-2 text-sm"
                        title="Usuń"
                      >
                        ✕
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
        <button type="button" onClick={addNew} className="text-xs text-sky-600 hover:text-sky-800 font-medium">
          + Dodaj opcję
        </button>
      </div>
    </div>
  )
}
