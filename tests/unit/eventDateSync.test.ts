import { describe, expect, it } from 'vitest'
import {
  buildEventDateReplacements,
  syncMultidateFormData,
  syncMultidateFormFields,
} from '@/lib/eventDateSync'

describe('eventDateSync', () => {
  it('builds replacements when event start or end date changes', () => {
    expect(buildEventDateReplacements(
      {
        start_at: '2026-07-10T10:00:00.000Z',
        end_at: '2026-07-11T10:00:00.000Z',
      },
      {
        start_at: '2026-07-12T10:00:00.000Z',
        end_at: '2026-07-13T10:00:00.000Z',
      },
    )).toEqual([
      { from: '2026-07-10', to: '2026-07-12' },
      { from: '2026-07-11', to: '2026-07-13' },
    ])
  })

  it('updates multidate field options that match moved event dates', () => {
    const synced = syncMultidateFormFields([
      {
        id: 'dates',
        label: 'Dates',
        type: 'multidate',
        required: true,
        options: ['2026-07-10', '2026-07-11', '2026-08-01'],
      },
    ], [{ from: '2026-07-10', to: '2026-07-12' }])

    expect(synced).toEqual([
      {
        id: 'dates',
        label: 'Dates',
        type: 'multidate',
        required: true,
        options: ['2026-07-12', '2026-07-11', '2026-08-01'],
      },
    ])
  })

  it('updates selected multidate values in registration form data', () => {
    const synced = syncMultidateFormData(
      { dates: ['2026-07-10', '2026-08-01'], other: 'keep' },
      ['dates'],
      [{ from: '2026-07-10', to: '2026-07-12' }],
    )

    expect(synced).toEqual({
      changed: true,
      data: { dates: ['2026-07-12', '2026-08-01'], other: 'keep' },
    })
  })
})
