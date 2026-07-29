'use client'
import { useMemo, useState } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import RegistrationStatusButton from '@/components/RegistrationStatusButton'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { formatDateShort } from '@/lib/utils'
import { GripVertical, Mail, CalendarDays } from 'lucide-react'
import type { FormField, Registration } from '@/types'
import type { CompetitionFormatDefinition } from '@/types/competition'
import {
  buildSpeedwayRegistrationContext,
  SPEEDWAY_CLASS_GROUPING_FIELD,
} from '@/lib/speedway'
import { resolveCompetitionGroupValue } from '@/lib/competitionEngine'
import {
  competitionGroupValueLabel,
  configuredCompetitionGroupValues,
} from '@/lib/competitionViews'

interface Props {
  initialRegistrations: Registration[]
  eventFormFields: FormField[]
  groupingField: string | null
  competitionDefinition: CompetitionFormatDefinition | null
  eventId: string
}

export default function RegistrationsClientList({
  initialRegistrations,
  eventFormFields,
  groupingField,
  competitionDefinition,
}: Props) {
  const sorted = useMemo(() => [...initialRegistrations].sort((a, b) => {
    if (a.order_index != null && b.order_index != null) return a.order_index - b.order_index
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  }), [initialRegistrations])

  const [registrations, setRegistrations] = useState<Registration[]>(sorted)
  const [saving, setSaving] = useState(false)

  function formatFormValue(value: unknown, field?: FormField): string {
    if (typeof value === 'boolean') return value ? 'Tak' : 'Nie'
    if (
      (field?.type === 'checkbox' || field === undefined) &&
      typeof value === 'string' &&
      ['true', 'false'].includes(value.trim().toLowerCase())
    ) {
      return value.trim().toLowerCase() === 'true' ? 'Tak' : 'Nie'
    }
    if (Array.isArray(value)) {
      if (field?.type === 'multidate') {
        return value
          .map(d => {
            const asString = String(d)
            try { return formatDateShort(asString) } catch { return asString }
          })
          .join(', ')
      }
      return value.map(item => formatFormValue(item, field)).join(', ')
    }
    return String(value)
  }

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

  function renderFormChips(reg: Registration) {
    const chips: { label: string; value: string }[] = []

    for (const f of eventFormFields) {
      const val = reg.form_data?.[f.id]
      if (val === undefined || val === null || val === '') continue
      chips.push({ label: f.label, value: formatFormValue(val, f) })
    }

    // Unknown keys
    for (const [k, v] of Object.entries(reg.form_data as Record<string, unknown>)) {
      if (eventFormFields.some(f => f.id === k)) continue
      if (v === undefined || v === null || v === '') continue
      chips.push({ label: k, value: formatFormValue(v) })
    }

    if (!chips.length) return null

    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {chips.map(({ label, value }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 bg-muted rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground max-w-full"
          >
            <span className="text-foreground/50 shrink-0">{label}:</span>
            <span className="font-medium text-foreground/80 truncate">{value}</span>
          </span>
        ))}
      </div>
    )
  }

  function renderTile(reg: Registration, index?: number, dragHandle?: React.ReactNode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (reg as any).participants
    const multidateDates = eventFormFields
      .filter(f => f.type === 'multidate')
      .flatMap(f => {
        const val = (reg.form_data as Record<string, unknown>)?.[f.id]
        return Array.isArray(val) ? (val as string[]) : []
      })

    return (
      <Card size="sm" className="relative transition-shadow hover:shadow-md">
        <CardHeader className="border-b pb-2">
          <div className="flex items-start gap-1.5 min-w-0">
            {dragHandle}
            {index !== undefined && (
              <span className="shrink-0 text-xs font-mono text-muted-foreground/60 pt-0.5 w-5 text-right">
                {index + 1}.
              </span>
            )}
            <CardTitle className="min-w-0 flex-1">
              <span className="truncate block">
                🐕 {p?.dog_name ?? '—'}
              </span>
              {p?.dog_breed && (
                <span className="text-xs font-normal text-muted-foreground block truncate">{p.dog_breed}</span>
              )}
            </CardTitle>
          </div>
          <CardAction>
            <RegistrationStatusButton
              regId={reg.id}
              status={reg.status}
              multidateDates={multidateDates}
            />
          </CardAction>
        </CardHeader>

        <CardContent className="pt-2 space-y-1">
          <p className="text-sm font-medium text-foreground/90 truncate">
            👤 {p?.owner_name ?? '—'}
          </p>
          {p?.owner_email && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <Mail className="w-3 h-3 shrink-0" />
              {p.owner_email}
            </p>
          )}
          <p className="flex items-center gap-1 text-xs text-muted-foreground/60">
            <CalendarDays className="w-3 h-3 shrink-0" />
            {new Date(reg.created_at).toLocaleDateString('pl-PL')}
          </p>
          {renderFormChips(reg)}
        </CardContent>
      </Card>
    )
  }

  // --- Grouped view (no DnD) ---
  if (groupingField) {
    const groupMap = new Map<string, Registration[]>()
    const field = eventFormFields.find(f => f.id === groupingField)
    const speedwayGroup = groupingField === SPEEDWAY_CLASS_GROUPING_FIELD
      ? competitionDefinition?.groups.find(group =>
          group.source.op === 'ref'
          && group.source.path === 'registration.dog_height_cm'
        )
      : null
    for (const reg of registrations) {
      const formData = reg.form_data as Record<string, unknown>
      const specialGroupValue = speedwayGroup
        ? resolveCompetitionGroupValue(speedwayGroup, {
            registration: {
              form_data: formData,
              ...buildSpeedwayRegistrationContext(
                formData,
                null,
                reg.participants?.dog_breed,
              ),
            },
          })
        : null
      const val = formData?.[groupingField]
      const keys: string[] = speedwayGroup
        ? [specialGroupValue
            ? competitionGroupValueLabel(speedwayGroup, specialGroupValue)
            : '— brak przypisanej klasy —']
        : Array.isArray(val)
          ? val.map(item => formatFormValue(item, field))
          : val != null && val !== ''
            ? [formatFormValue(val, field)]
            : ['— brak —']
      for (const k of keys) {
        if (!groupMap.has(k)) groupMap.set(k, [])
        groupMap.get(k)!.push(reg)
      }
    }

    const configuredGroupOrder = speedwayGroup
      ? configuredCompetitionGroupValues(speedwayGroup).map(option => option.label)
      : []

    return (
      <div className="space-y-6">
        {[...groupMap.entries()]
          .sort(([a], [b]) => {
            if (configuredGroupOrder.length > 0) {
              const left = configuredGroupOrder.indexOf(a)
              const right = configuredGroupOrder.indexOf(b)
              const normalizedLeft = left === -1 ? Number.MAX_SAFE_INTEGER : left
              const normalizedRight = right === -1 ? Number.MAX_SAFE_INTEGER : right
              if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight
            }
            return a.localeCompare(b, 'pl')
          })
          .map(([group, regs]) => (
            <div key={group}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1 mb-3">
                {group}{' '}
                <span className="font-normal normal-case text-muted-foreground/60">({regs.length})</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {regs.map((reg, i) => (
                  <div key={reg.id}>{renderTile(reg, i)}</div>
                ))}
              </div>
            </div>
          ))}
      </div>
    )
  }

  // --- DnD grid view ---
  return (
    <>
      {saving && (
        <p className="text-xs text-muted-foreground mb-2 text-center">💾 Zapisywanie kolejności...</p>
      )}
      <p className="text-xs text-muted-foreground/60 mb-3 flex items-center gap-1">
        <GripVertical className="w-3.5 h-3.5" />
        Przeciągaj kafelki, aby zmienić kolejność startową uczestników.
      </p>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="registrations">
          {provided => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
            >
              {registrations.map((reg, index) => (
                <Draggable key={reg.id} draggableId={reg.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={snapshot.isDragging ? 'opacity-80 scale-[1.02] z-10' : ''}
                    >
                      {renderTile(
                        reg,
                        index,
                        <div
                          {...provided.dragHandleProps}
                          className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground mt-0.5 shrink-0 select-none"
                          title="Przeciągnij, aby zmienić kolejność"
                        >
                          <GripVertical className="w-4 h-4" />
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

