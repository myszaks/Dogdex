import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerClient = vi.fn()
const createAuthClient = vi.fn()
const checkRoleForApi = vi.fn()
const sendRegistrationEmail = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient,
  createAuthClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  checkRoleForApi,
}))

vi.mock('@/lib/email', () => ({
  sendRegistrationEmail,
}))

describe('POST /api/registrations', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('rejects registration when the deadline is already past', async () => {
    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'event-1',
                    status: 'upcoming',
                    auto_confirm: true,
                    max_participants: null,
                    title: 'Spacer',
                    start_at: '2000-07-10T10:00:00.000Z',
                    end_at: null,
                    location: 'Park',
                    form_fields: [],
                    registration_deadline: '2000-07-09T10:00:00.000Z',
                  },
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/registrations/route')
    const response = await POST(new Request('http://localhost/api/registrations', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'event-1',
        ownerName: 'Jan Kowalski',
        dogName: 'Burek',
      }),
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('zamkni'),
    })
  })

  it('removes orphan participant when registration creation fails', async () => {
    const cleanupEq = vi.fn().mockResolvedValue({ error: null })

    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'event-1',
                    status: 'upcoming',
                    auto_confirm: true,
                    max_participants: null,
                    title: 'Spacer',
                    start_at: '2026-07-20T10:00:00.000Z',
                    end_at: null,
                    location: 'Park',
                    form_fields: [],
                    registration_deadline: null,
                  },
                }),
              }),
            }),
          }
        }

        if (table === 'participants') {
          return {
            select: () => ({
              ilike: () => ({
                ilike: async () => ({ data: [] }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: 'participant-1' },
                  error: null,
                }),
              }),
            }),
            delete: () => ({
              eq: cleanupEq,
            }),
          }
        }

        if (table === 'registrations') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { message: 'insert failed' },
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/registrations/route')
    const response = await POST(new Request('http://localhost/api/registrations', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'event-1',
        ownerName: 'Jan Kowalski',
        ownerEmail: 'jan@example.com',
        dogName: 'Burek',
      }),
    }))

    expect(response.status).toBe(500)
    expect(cleanupEq).toHaveBeenCalledWith('id', 'participant-1')
  })
})
