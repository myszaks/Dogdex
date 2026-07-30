import { describe, expect, it } from 'vitest'
import { scheduleSlotOptions } from '@/lib/scheduleManagement'

describe('accessible schedule assignment options', () => {
  const slots = [
    {
      id: 'slot-1',
      slot_date: '2026-08-10',
      max_participants: 1,
    },
    {
      id: 'slot-2',
      slot_date: '2026-08-10',
      max_participants: 2,
    },
    {
      id: 'slot-other-day',
      slot_date: '2026-08-11',
      max_participants: 5,
    },
  ]

  it('shows only slots from the participant selected date', () => {
    const options = scheduleSlotOptions(
      slots,
      [{ slotId: null }],
      '2026-08-10',
      null,
    )

    expect(options.map(option => option.slot.id)).toEqual(['slot-1', 'slot-2'])
  })

  it('disables a full target but keeps the current full slot selectable', () => {
    const assignments = [{ slotId: 'slot-1' }]

    expect(scheduleSlotOptions(slots, assignments, '2026-08-10', null)[0].full).toBe(true)
    expect(scheduleSlotOptions(slots, assignments, '2026-08-10', 'slot-1')[0].full).toBe(false)
  })
})
