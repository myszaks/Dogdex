import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerClient = vi.fn()
const checkRoleForApi = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  checkRoleForApi,
}))

describe('GET /api/events/[id]/schedule-assignments', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('rejects organizers who do not own the event', async () => {
    checkRoleForApi.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })

    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { created_by: 'organizer-2', form_fields: [] },
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { GET } = await import('@/app/api/events/[id]/schedule-assignments/route')
    const response = await GET(new Request('http://localhost/api/events/event-1/schedule-assignments'), {
      params: Promise.resolve({ id: 'event-1' }),
    })

    expect(response.status).toBe(403)
  })

  it('filters out assignments for dates removed from multidate registrations', async () => {
    checkRoleForApi.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })

    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    created_by: 'organizer-1',
                    form_fields: [{ id: 'dates', type: 'multidate' }],
                  },
                }),
              }),
            }),
          }
        }

        if (table === 'registrations') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [
                    {
                      id: 'reg-1',
                      form_data: { dates: ['2026-07-10'] },
                    },
                  ],
                }),
              }),
            }),
          }
        }

        if (table === 'schedule_assignments') {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  { id: 'a1', registration_id: 'reg-1', item_date: '2026-07-10', time_slot_id: 'slot-1' },
                  { id: 'a2', registration_id: 'reg-1', item_date: '2026-07-11', time_slot_id: 'slot-2' },
                ],
                error: null,
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { GET } = await import('@/app/api/events/[id]/schedule-assignments/route')
    const response = await GET(new Request('http://localhost/api/events/event-1/schedule-assignments'), {
      params: Promise.resolve({ id: 'event-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      { id: 'a1', registration_id: 'reg-1', item_date: '2026-07-10', time_slot_id: 'slot-1' },
    ])
  })
})
