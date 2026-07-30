interface SlotLike {
  id: string
  slot_date: string
  max_participants: number | null
}

interface AssignmentLike {
  slotId: string | null
}

export function scheduleSlotOptions<T extends SlotLike>(
  slots: T[],
  assignments: AssignmentLike[],
  itemDate: string,
  currentSlotId: string | null,
) {
  return slots
    .filter(slot => !itemDate || slot.slot_date === itemDate)
    .map(slot => {
      const assignedCount = assignments.filter(item => item.slotId === slot.id).length
      const full = slot.max_participants != null
        && assignedCount >= slot.max_participants
        && currentSlotId !== slot.id

      return { slot, assignedCount, full }
    })
}
